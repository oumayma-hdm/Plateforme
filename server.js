const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { createProxyMiddleware } = require("http-proxy-middleware");

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
const SUCCESS_URL = process.env.SUCCESS_URL || null;
const FAILURE_URL = process.env.FAILURE_URL || null;
const NOTIFY_URL = process.env.NOTIFY_URL || null;

if (!UNIPILE_DSN || !UNIPILE_API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    "Warning: UNIPILE_DSN or UNIPILE_API_KEY missing. Set them in .env or env.local to enable the connect flow."
  );
}

let unipile = null;
let unipileBaseUrl = null;
if (UNIPILE_DSN && UNIPILE_API_KEY) {
  const dsnIsUrl = /^https?:\/\//i.test(UNIPILE_DSN);
  unipileBaseUrl = dsnIsUrl ? UNIPILE_DSN : `https://${UNIPILE_DSN}`;
  unipile = new UnipileClient(unipileBaseUrl, UNIPILE_API_KEY);
}

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

function getRequestBaseUrl(req) {
  const proto = (
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "https"
  ).toString();
  const host = (req.headers.host || "").toString();
  return `${proto}://${host}`;
}

app.get("/connect/linkedin", async (req, res) => {
  try {
    if (!unipile) {
      return res
        .status(400)
        .json({ error: "Server missing UNIPILE_DSN or UNIPILE_API_KEY" });
    }

    const expiresOn = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const requestBase = getRequestBaseUrl(req);
    const apiUrlForHosted = `${requestBase}/unipile-api`;
    const successForHosted = SUCCESS_URL || `${requestBase}/success`;
    const failureForHosted = FAILURE_URL || `${requestBase}/failure`;
    const notifyForHosted = NOTIFY_URL || `${requestBase}/unipile/notify`;
    const hosted = await unipile.account.createHostedAuthLink({
      type: "create",
      expiresOn,
      // Point to our reverse proxy so the hosted wizard uses port 443 on our domain
      api_url: apiUrlForHosted,
      providers: ["LINKEDIN"],
      success_redirect_url: successForHosted,
      failure_redirect_url: failureForHosted,
      notify_url: notifyForHosted,
    });

    if (hosted && hosted.url) {
      return res.redirect(hosted.url);
    }
    return res
      .status(500)
      .json({ error: "Failed to create a hosted auth link" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error creating hosted auth link", err);
    return res
      .status(500)
      .json({ error: "Internal error", details: String(err?.message || err) });
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

// Proxy Unipile API via our domain so the hosted wizard can call port 443
if (UNIPILE_DSN) {
  const target = unipileBaseUrl || UNIPILE_DSN;
  // CORS on base paths (handles preflight automatically)
  const corsForHosted = cors({
    origin: "https://account.unipile.com",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key"],
    credentials: false,
  });
  app.use("/api/v1", corsForHosted);
  app.use("/unipile-api", corsForHosted);

  // Explicitly terminate preflight before proxying
  app.use("/unipile-api", (req, res, next) => {
    if (req.method === "OPTIONS") {
      const requestHeaders =
        req.headers["access-control-request-headers"] ||
        "Content-Type, x-api-key";
      res.setHeader(
        "Access-Control-Allow-Origin",
        "https://account.unipile.com"
      );
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
      res.setHeader("Access-Control-Allow-Headers", requestHeaders);
      return res.status(204).end();
    }
    return next();
  });
  app.use("/api/v1", (req, res, next) => {
    if (req.method === "OPTIONS") {
      const requestHeaders =
        req.headers["access-control-request-headers"] ||
        "Content-Type, x-api-key";
      res.setHeader(
        "Access-Control-Allow-Origin",
        "https://account.unipile.com"
      );
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS"
      );
      res.setHeader("Access-Control-Allow-Headers", requestHeaders);
      return res.status(204).end();
    }
    return next();
  });

  // Some hosted flows build absolute "/api/v1/..." paths from api_url origin only
  app.use(
    "/api/v1",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      headers: {
        // Ensure CORS passthrough for preflight
        "Access-Control-Allow-Origin": "https://account.unipile.com",
      },
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader("x-api-key", UNIPILE_API_KEY || "");
      },
      onProxyRes: (proxyRes) => {
        proxyRes.headers["access-control-allow-origin"] =
          "https://account.unipile.com";
        proxyRes.headers["access-control-allow-methods"] =
          "GET,POST,PUT,PATCH,DELETE,OPTIONS";
        proxyRes.headers["access-control-allow-headers"] =
          "Content-Type, x-api-key";
      },
      logLevel: "silent",
    })
  );

  app.use(
    "/unipile-api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      secure: true,
      pathRewrite: {
        "^/unipile-api": "",
      },
      headers: {
        "Access-Control-Allow-Origin": "https://account.unipile.com",
      },
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader("x-api-key", UNIPILE_API_KEY || "");
      },
      onProxyRes: (proxyRes) => {
        proxyRes.headers["access-control-allow-origin"] =
          "https://account.unipile.com";
        proxyRes.headers["access-control-allow-methods"] =
          "GET,POST,PUT,PATCH,DELETE,OPTIONS";
        proxyRes.headers["access-control-allow-headers"] =
          "Content-Type, x-api-key";
      },
      logLevel: "silent",
    })
  );
}

// If running on Vercel, export the Express handler instead of listening
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on ${BASE_URL}`);
  });
}
