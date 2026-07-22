/**
 * SUPABASE-02 — Read-only remote audit via existing local env (no link, no mutations).
 * Never prints secrets.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(ROOT, ".env.local");

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = refMatch ? refMatch[1] : null;

const report = {
  patch: "SUPABASE-02",
  mode: "read_only",
  projectRef,
  supabaseHost: url ? new URL(url).host : null,
  checks: {},
  blocked: [],
};

if (!url || !key) {
  report.blocked.push("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

async function fetchJson(path, extraHeaders = {}) {
  const res = await fetch(`${url}${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...extraHeaders,
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { parseError: true, snippet: text.slice(0, 120) };
  }
  return {
    status: res.status,
    headers: {
      "content-range": res.headers.get("content-range"),
      "content-type": res.headers.get("content-type"),
    },
    data,
  };
}

const openapi = await fetchJson("/rest/v1/");
report.checks.openapiStatus = openapi.status;
const defs = openapi.data?.definitions || {};
report.checks.publicTablesExposedViaRest = Object.keys(defs)
  .filter((k) => !k.includes("."))
  .sort();

const ae = defs.analytics_events;
if (ae?.properties) {
  report.checks.analyticsEvents = {
    columnCount: Object.keys(ae.properties).length,
    required: ae.required || [],
    columns: Object.keys(ae.properties).sort(),
  };
}

const countRes = await fetchJson("/rest/v1/analytics_events?select=id&limit=1", {
  Prefer: "count=exact",
});
report.checks.analyticsEventsCountRange = countRes.headers["content-range"];

const migPublic = await fetchJson("/rest/v1/schema_migrations?select=version&limit=5");
report.checks.schemaMigrationsViaPublicRest = {
  status: migPublic.status,
  accessible: migPublic.status === 200,
};

const migSchema = await fetchJson("/rest/v1/rpc/version");
report.checks.rpcVersionProbe = { status: migSchema.status };

console.log(JSON.stringify(report, null, 2));
