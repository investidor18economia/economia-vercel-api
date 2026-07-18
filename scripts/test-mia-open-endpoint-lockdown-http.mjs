/**
 * PATCH 12D — Local HTTP smoke for endpoint lockdown (starts/stops Next server).
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  issueUserSessionToken,
} from "../lib/miaUserSessionToken.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.MIA_LOCKDOWN_HTTP_PORT || 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = "lockdown-test-secret";
const SESSION_SECRET = "lockdown-session-secret";

let passed = 0;
let failed = 0;
let serverProc = null;

function expectTrue(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failed += 1;
  console.error(`FAIL: ${label}`);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const res = await fetch(`${BASE}/app-mia`);
      if (res.status === 200) return true;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  return false;
}

async function request(pathname, options = {}) {
  const res = await fetch(`${BASE}${pathname}`, options);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, headers: Object.fromEntries(res.headers.entries()), text, json };
}

async function startServer() {
  if (process.env.MIA_LOCKDOWN_SKIP_SERVER === "1") {
    return waitForServer(5000);
  }

  serverProc = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      API_SHARED_KEY: SECRET,
      MIA_USER_SESSION_SECRET: SESSION_SECRET,
      MIA_DEV_ROUTES_ENABLED: "false",
      MIA_LEGACY_ECONOMIA_ENABLED: "false",
      MIA_CRON_SECRET: "cron-local-secret",
      MIA_ADMIN_API_KEY: "admin-local-secret",
      MIA_PUBLIC_DEBUG_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProc.stdout.on("data", () => {});
  serverProc.stderr.on("data", () => {});

  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error("Missing production build. Run npm run build first.");
  }

  return waitForServer();
}

function stopServer() {
  if (serverProc && !serverProc.killed) {
    serverProc.kill("SIGTERM");
  }
}

async function main() {
  const ready = await startServer();
  expectTrue("local server ready", ready);

  const appMia = await request("/app-mia");
  expectTrue("GET /app-mia", appMia.status === 200);

  const chat = await request("/api/mia-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "oi",
      user_id: "guest",
      conversation_id: "lockdown-local",
      messages: [],
      session_context: {},
    }),
  });
  expectTrue("POST /api/mia-chat", chat.status === 200 && chat.json?.reply);

  const coreDenied = await request("/api/chat-gpt4o", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "oi" }),
  });
  expectTrue("POST /api/chat-gpt4o without key -> 401", coreDenied.status === 401);

  const coreGet = await request("/api/chat-gpt4o");
  expectTrue("GET /api/chat-gpt4o -> 405", coreGet.status === 405);

  const devRoute = await request("/api/dev/commercial-shadow?q=test");
  expectTrue("dev route blocked", devRoute.status === 404);

  const envRoute = await request("/api/env");
  expectTrue("env route blocked", envRoute.status === 404);

  const economia = await request("/api/economia", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": SECRET },
    body: JSON.stringify({ text: "oi" }),
  });
  expectTrue("economia legacy blocked", economia.status === 404);

  const writeDenied = await request("/api/delete-wish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "wish-1", user_id: "user-1" }),
  });
  expectTrue("delete-wish requires session", writeDenied.status === 401);

  const token = issueUserSessionToken("user-1", {
    MIA_USER_SESSION_SECRET: SESSION_SECRET,
  });
  const writeMismatch = await request("/api/delete-wish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ id: "wish-1", user_id: "user-2" }),
  });
  expectTrue("delete-wish rejects user mismatch", writeMismatch.status === 403);

  const cronDenied = await request("/api/check-prices");
  expectTrue("check-prices requires cron secret", cronDenied.status === 401);

  const cronOk = await request("/api/check-prices", {
    headers: { Authorization: "Bearer cron-local-secret" },
  });
  expectTrue("check-prices accepts cron secret", cronOk.status === 200);

  const analyticsBlocked = await request("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: "not_allowed_event" }),
  });
  expectTrue("analytics rejects unknown event", analyticsBlocked.status === 400);

  const analyticsOk = await request("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_name: "session_started", metadata: { page: "/app-mia" } }),
  });
  expectTrue("analytics accepts allowed event", analyticsOk.status === 200);

  console.log(`\nLocal HTTP lockdown smoke: ${passed} passed, ${failed} failed`);
  stopServer();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  stopServer();
  process.exit(1);
});
