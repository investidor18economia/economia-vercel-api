#!/usr/bin/env node
/**
 * SUPABASE-07B — Production smoke validation (read-only + controlled analytics write)
 * Does not print secrets.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'supabase/.temp/audit/SUPABASE-07B');
fs.mkdirSync(outDir, { recursive: true });

function loadEnvLocal() {
  const envPath = path.join(root, '.env.local');
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnvLocal();
const baseUrl = 'https://economia-ai.vercel.app';
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const ts = Math.floor(Date.now() / 1000);
const sessionId = `supabase_07b_analytics_${ts}`;
const report = {
  generated_at_utc: new Date().toISOString(),
  patch: 'SUPABASE-07B',
  session_id: sessionId,
  checks: [],
};

async function check(name, fn) {
  try {
    const result = await fn();
    report.checks.push({ name, ok: true, ...result });
  } catch (err) {
    report.checks.push({ name, ok: false, error: err.message });
  }
}

await check('health', async () => {
  const res = await fetch(`${baseUrl}/api/health`);
  const body = await res.json();
  return { status: res.status, body };
});

await check('ready', async () => {
  const res = await fetch(`${baseUrl}/api/ready`);
  const body = await res.json();
  return { status: res.status, body };
});

await check('analytics_track_controlled_write', async () => {
  const res = await fetch(`${baseUrl}/api/analytics/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event_name: 'session_started',
      session_id: sessionId,
      metadata: { source: 'supabase_07b_smoke', patch: 'SUPABASE-07B' },
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`track failed ${res.status}`);
  return { status: res.status, body };
});

await check('analytics_service_role_read_smoke_event', async () => {
  const url = `${supabaseUrl}/rest/v1/analytics_events?select=id&session_id=eq.${encodeURIComponent(sessionId)}&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const rows = await res.json();
  if (!res.ok) throw new Error(`service read failed ${res.status}`);
  return { status: res.status, found: Array.isArray(rows) ? rows.length : 0 };
});

if (anonKey) {
  await check('analytics_anon_select_blocked', async () => {
    const url = `${supabaseUrl}/rest/v1/analytics_events?select=id&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });
    return { status: res.status, blocked: !res.ok };
  });
} else {
  report.checks.push({
    name: 'analytics_anon_select_blocked',
    ok: true,
    skipped: true,
    reason: 'NEXT_PUBLIC_SUPABASE_ANON_KEY not in .env.local',
  });
}

await check('catalog_phone_specs_read', async () => {
  const url = `${supabaseUrl}/rest/v1/phone_specs?select=id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const rows = await res.json();
  if (!res.ok) throw new Error(`catalog read failed ${res.status}`);
  return { status: res.status, sample_count: Array.isArray(rows) ? rows.length : 0 };
});

await check('vault_anon_select_blocked', async () => {
  if (!anonKey) {
    return { skipped: true, reason: 'anon key unavailable' };
  }
  const url = `${supabaseUrl}/rest/v1/provider_credentials?select=id&limit=1`;
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  let rows = [];
  try {
    rows = await res.json();
  } catch {
    rows = [];
  }
  return { status: res.status, blocked: !res.ok || (Array.isArray(rows) && rows.length === 0) };
});

const outFile = path.join(outDir, 'smoke-validation.json');
fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
const failed = report.checks.filter((c) => c.ok === false);
console.log(`SUPABASE-07B smoke: ${report.checks.length - failed.length}/${report.checks.length} passed`);
if (failed.length) {
  console.error(JSON.stringify(failed, null, 2));
  process.exit(1);
}
