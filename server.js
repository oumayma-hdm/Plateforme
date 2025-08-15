const fs = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

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
const SUCCESS_URL = process.env.SUCCESS_URL || `${BASE_URL}/success`;
const FAILURE_URL = process.env.FAILURE_URL || `${BASE_URL}/failure`;
const NOTIFY_URL = process.env.NOTIFY_URL || `${BASE_URL}/unipile/notify`;

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

app.get("/connect/linkedin", async (_req, res) => {
  try {
    if (!unipile) {
      return res
        .status(400)
        .json({ error: "Server missing UNIPILE_DSN or UNIPILE_API_KEY" });
    }

    const expiresOn = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const hosted = await unipile.account.createHostedAuthLink({
      type: "create",
      expiresOn,
      // Important: api_url must point to your Unipile API base (DSN), not your app URL
      api_url: unipileBaseUrl,
      providers: ["LINKEDIN"],
      success_redirect_url: SUCCESS_URL,
      failure_redirect_url: FAILURE_URL,
      notify_url: NOTIFY_URL,
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

// If running on Vercel, export the Express handler instead of listening
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on ${BASE_URL}`);
  });
}
