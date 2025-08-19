const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const axios = require("axios");

// Load environment variables from .env if present, else from env.local
const envPathDot = path.join(__dirname, ".env");
const envPathLocal = path.join(__dirname, "env.local");
if (fs.existsSync(envPathDot)) {
  dotenv.config({ path: envPathDot });
} else if (fs.existsSync(envPathLocal)) {
  dotenv.config({ path: envPathLocal });
} else {
  dotenv.config();
}

const { UnipileClient } = require("unipile-node-sdk");

const app = express();
app.use(express.json());
// Allow browser requests from Unipile hosted auth page and from your own origin
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
// Auto-detect Vercel environment URL if not provided explicitly
const inferredVercelUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : null;
const BASE_URL =
  process.env.BASE_URL || inferredVercelUrl || `http://localhost:${PORT}`;

const UNIPILE_DSN = process.env.UNIPILE_DSN;
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY;
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
// Public HTTPS origin for Unipile hosted flow
const API_ORIGIN = process.env.API_ORIGIN || BASE_URL;
const SUCCESS_URL = process.env.SUCCESS_URL || `${BASE_URL}/success`;
const FAILURE_URL = process.env.FAILURE_URL || `${BASE_URL}/failure`;
const NOTIFY_URL = process.env.NOTIFY_URL || `${BASE_URL}/unipile/notify`;

if (!UNIPILE_DSN || !UNIPILE_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "Warning: UNIPILE_DSN or UNIPILE_API_KEY missing. Set them in .env or env.local to enable the connect flow."
  );
}

if (!LINKEDIN_CLIENT_ID || !LINKEDIN_CLIENT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    "Warning: LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET missing. Set them in .env or env.local to enable LinkedIn OAuth."
  );
}

let unipile = null;
if (UNIPILE_DSN && UNIPILE_API_KEY) {
  const dsnIsUrl = /^https?:\/\//i.test(UNIPILE_DSN);
  const base = dsnIsUrl ? UNIPILE_DSN : `https://${UNIPILE_DSN}`;
  console.log("Initializing Unipile client with:", {
    base,
    hasApiKey: !!UNIPILE_API_KEY,
  });
  unipile = new UnipileClient(base, UNIPILE_API_KEY);
  console.log("Unipile client initialized successfully");
} else {
  console.warn("Unipile client not initialized - missing credentials");
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Unipile hosted flow (shows Unipile page where the user enters LinkedIn credentials)
app.get("/connect/linkedin", async (_req, res) => {
  try {
    if (!unipile) {
      return res.status(400).json({
        error: "Server missing UNIPILE_DSN or UNIPILE_API_KEY",
      });
    }

    // Prefer public HTTPS origin for Unipile callbacks
    const publicOrigin = API_ORIGIN;

    // Ensure api_url includes the full URL with port for localhost
    const apiUrl = publicOrigin.includes("localhost")
      ? publicOrigin
      : new URL(publicOrigin).origin;

    console.log("Debug - publicOrigin:", publicOrigin);
    console.log("Debug - apiUrl:", apiUrl);

    const expiresOn = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const params = {
      type: "create",
      expiresOn,
      redirect_url: apiUrl, // Try redirect_url as primary
      base_url: apiUrl, // Keep base_url as backup
      api_url: apiUrl, // Keep api_url as backup
      providers: ["LINKEDIN"],
      success_redirect_url: `${publicOrigin}/success`,
      failure_redirect_url: `${publicOrigin}/failure`,
      notify_url: `${publicOrigin}/unipile/notify`,
    };

    console.log("Creating Unipile hosted auth link with params:", params);

    // SDK path can vary; in 1.9.x this is exposed under account.client.account
    const hosted = await unipile.account.client.account.createHostedAuthLink(
      params
    );

    console.log("Hosted auth link response:", hosted);

    if (hosted && hosted.url) {
      return res.redirect(hosted.url);
    }
    return res
      .status(500)
      .json({ error: "Failed to create a hosted auth link" });
  } catch (err) {
    const body = err?.body || err;
    // eslint-disable-next-line no-console
    console.error("Error creating hosted auth link:", {
      message: err?.message,
      status: body?.status,
      type: body?.type,
      title: body?.title,
      details: body,
    });
    return res.status(500).json({
      error: "Internal error",
      details: err?.message || String(err),
      unipile: err?.body || undefined,
    });
  }
});

// LinkedIn direct OAuth kept available for debugging
app.get("/linkedin/callback", async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error("LinkedIn OAuth error:", error);
      return res.redirect(`${FAILURE_URL}?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      console.error("No authorization code received from LinkedIn");
      return res.redirect(`${FAILURE_URL}?error=no_code`);
    }

    console.log("Received LinkedIn OAuth code:", code);

    // Exchange code for access token
    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: `${BASE_URL}/linkedin/callback`,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const { access_token, expires_in } = tokenResponse.data;
    console.log("LinkedIn access token received, expires in:", expires_in);

    // Get user profile from LinkedIn
    const profileResponse = await axios.get("https://api.linkedin.com/v2/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    const linkedinProfile = profileResponse.data;
    console.log("LinkedIn profile:", linkedinProfile);

    // Redirect to success page with connection info
    return res.redirect(
      `${SUCCESS_URL}?provider=linkedin&name=${encodeURIComponent(
        linkedinProfile.localizedFirstName +
          " " +
          linkedinProfile.localizedLastName
      )}`
    );
  } catch (err) {
    console.error("Error in LinkedIn OAuth callback:", err);
    return res.redirect(
      `${FAILURE_URL}?error=${encodeURIComponent(
        err.message || "unknown_error"
      )}`
    );
  }
});

app.get("/test-unipile", async (_req, res) => {
  try {
    if (!unipile) {
      return res.status(400).json({
        error: "Unipile client not initialized",
        hasDsn: !!UNIPILE_DSN,
        hasApiKey: !!UNIPILE_API_KEY,
      });
    }

    console.log("Testing Unipile client connection...");

    // Explore the SDK structure in detail
    const accountClient = unipile.account.client;
    const accountClientMethods = accountClient
      ? Object.getOwnPropertyNames(accountClient)
      : [];

    console.log("Detailed Unipile client structure:", {
      hasAccount: !!unipile.account,
      accountMethods: Object.getOwnPropertyNames(unipile.account || {}),
      accountClientMethods: accountClientMethods,
      clientMethods: Object.getOwnPropertyNames(unipile),
      accountClientType: typeof accountClient,
    });

    return res.json({
      success: true,
      message: "Unipile client is working",
      hasAccount: !!unipile.account,
      accountMethods: Object.getOwnPropertyNames(unipile.account || {}),
      accountClientMethods: accountClientMethods,
      clientMethods: Object.getOwnPropertyNames(unipile),
      accountClientType: typeof accountClient,
    });
  } catch (err) {
    console.error("Test error:", {
      message: err?.message,
      status: err?.body?.status,
      type: err?.body?.type,
      title: err?.body?.title,
    });

    return res.status(500).json({
      error: "Unipile test failed",
      details: err?.message || String(err),
      status: err?.body?.status,
      type: err?.body?.type,
      title: err?.body?.title,
    });
  }
});

app.get("/success", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "success.html"));
});

app.get("/failure", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "failure.html"));
});

// Unipile notify callback (set as notify_url)
app.post("/unipile/notify", (req, res) => {
  // In production, verify signature if available, and map to your user by correlation id (if you add one via extra params)
  // eslint-disable-next-line no-console
  console.log("Unipile notify:", JSON.stringify(req.body));
  res.status(204).end();
});

// Handle the specific auth_payload endpoint that Unipile calls
app.get("/api/v1/hosted/accounts/auth_payload", (req, res) => {
  console.log("Received auth_payload request from hosted page:", req.query);

  // Set CORS headers
  res.header("Access-Control-Allow-Origin", "https://account.unipile.com");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, X-Requested-With, Authorization"
  );
  res.header("Vary", "Origin");

  // This endpoint should return the authentication payload
  // For now, let's return a success response
  res.json({
    success: true,
    message: "Auth payload endpoint reached successfully",
    timestamp: new Date().toISOString(),
    query: req.query,
  });
});

// Handle the unipile-api prefixed auth_payload endpoint that Unipile actually calls
app.get("/unipile-api/api/v1/hosted/accounts/auth_payload", (req, res) => {
  console.log(
    "Received unipile-api auth_payload request from hosted page:",
    req.query
  );

  // Set CORS headers
  res.header("Access-Control-Allow-Origin", "https://account.unipile.com");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, X-Requested-With, Authorization"
  );
  res.header("Vary", "Origin");

  // This endpoint should return the authentication payload
  // For now, let's return a success response
  res.json({
    success: true,
    message: "Auth payload endpoint reached via unipile-api path",
    timestamp: new Date().toISOString(),
    query: req.query,
    note: "This request came through the /unipile-api path",
  });
});

// Handle OPTIONS preflight request for CORS
app.options("/api/v1/hosted/accounts/auth_payload", (req, res) => {
  res.header("Access-Control-Allow-Origin", "https://account.unipile.com");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, X-Requested-With, Authorization"
  );
  res.header("Vary", "Origin");
  res.status(200).end();
});

// Handle OPTIONS preflight request for the unipile-api path
app.options("/unipile-api/api/v1/hosted/accounts/auth_payload", (req, res) => {
  res.header("Access-Control-Allow-Origin", "https://account.unipile.com");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, X-Requested-With, Authorization"
  );
  res.header("Vary", "Origin");
  res.status(200).end();
});

// Catch-all handler for any other /unipile-api/* paths
app.all("/unipile-api/*", (req, res) => {
  console.log(`Unipile API request: ${req.method} ${req.path}`);

  // Set CORS headers
  res.header("Access-Control-Allow-Origin", "https://account.unipile.com");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, x-api-key, X-Requested-With, Authorization"
  );
  res.header("Vary", "Origin");

  // For now, return a generic response
  res.json({
    success: true,
    message: "Unipile API endpoint reached",
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    note: "This is a catch-all handler for /unipile-api/* paths",
  });
});

// If running on Vercel, export the Express handler instead of listening
if (process.env.VERCEL) {
  module.exports = app;
} else {
  // Listen on the main port (3000)
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on ${BASE_URL}`);
  });
}
