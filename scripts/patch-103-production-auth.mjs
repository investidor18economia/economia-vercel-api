#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { issueUserSessionToken } from "../lib/miaUserSessionToken.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const BASE = process.env.PATCH103_PROD_BASE_URL || "https://economia-ai.vercel.app";

function extractOtpFromHtml(html = "") {
  const match = String(html).match(/\b(\d{6})\b/);
  return match?.[1] || null;
}

async function fetchOtpFromResend(email, startedAtMs) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) return null;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 3000));
    const listRes = await fetch("https://api.resend.com/emails?limit=20", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!listRes.ok) continue;
    const listJson = await listRes.json().catch(() => ({}));
    const candidates = (listJson?.data || []).filter((item) => {
      const toList = Array.isArray(item.to) ? item.to : [item.to].filter(Boolean);
      const createdMs = Date.parse(String(item.created_at || ""));
      return (
        toList.some((to) => String(to).toLowerCase() === email.toLowerCase()) &&
        String(item.subject || "").includes("código de acesso") &&
        Number.isFinite(createdMs) &&
        createdMs >= startedAtMs - 5000
      );
    });
    if (!candidates.length) continue;
    const detailRes = await fetch(`https://api.resend.com/emails/${candidates[0].id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!detailRes.ok) continue;
    const detailJson = await detailRes.json().catch(() => ({}));
    const otp = extractOtpFromHtml(detailJson?.html || "");
    if (otp) return otp;
  }

  return null;
}

export async function obtainProductionSession(options = {}) {
  if (process.env.PATCH103_PROD_SESSION_TOKEN && process.env.PATCH103_TEST_USER_ID) {
    return {
      userId: process.env.PATCH103_TEST_USER_ID,
      sessionToken: process.env.PATCH103_PROD_SESSION_TOKEN,
      source: "env",
    };
  }

  const email =
    options.email ||
    process.env.PATCH103_AUTH_EMAIL ||
    `patch103-smoke-${Date.now()}@teilor-qa.invalid`;
  const presetOtp = options.otp || process.env.PATCH103_AUTH_OTP || null;
  const startedAtMs = Date.now();

  const req = await fetch(`${BASE}/api/auth/request-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, name: options.name || "PATCH 103 Smoke" }),
  });
  const reqJson = await req.json().catch(() => ({}));
  if (!req.ok || !reqJson?.challenge_id) {
    throw new Error(`request-code failed: ${req.status} ${reqJson?.reasonCode || reqJson?.error || ""}`);
  }

  const otp = presetOtp || (await fetchOtpFromResend(email, startedAtMs));
  if (!otp) {
    throw new Error("Unable to obtain OTP from Resend for production auth");
  }

  const verify = await fetch(`${BASE}/api/auth/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challenge_id: reqJson.challenge_id,
      code: String(otp).trim(),
      name: options.name || "PATCH 103 Smoke",
    }),
  });
  const verifyJson = await verify.json().catch(() => ({}));
  if (!verify.ok || !verifyJson?.session_token) {
    throw new Error(`verify-code failed: ${verify.status} ${verifyJson?.reasonCode || verifyJson?.error || ""}`);
  }

  return {
    userId: verifyJson.user?.id,
    sessionToken: verifyJson.session_token,
    email,
    source: presetOtp ? "otp_env" : "otp_resend",
  };
}

if (process.argv[1] && process.argv[1].includes("patch-103-production-auth.mjs")) {
  try {
    const auth = await obtainProductionSession();
    console.log(JSON.stringify({ ok: true, source: auth.source, userId: auth.userId }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}
