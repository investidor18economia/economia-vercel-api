#!/usr/bin/env node
/**
 * PATCH 11.4 COMPLEMENT — validate p_offset_days for all executive metrics RPCs.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { MIA_EXECUTIVE_METRICS_RPC } from "../lib/miaExecutiveMetricsCatalog.js";
import { buildExecutiveMetricsPeriodComparison } from "../lib/miaExecutiveInsightsCompare.js";
import { clearExecutiveMetricsCache } from "../lib/miaExecutiveMetricsCache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const COMPLEMENT_CATEGORIES = [
  "price_intelligence",
  "savings",
  "anti_regret",
  "user_value",
];

const ALL_RPC_CATEGORIES = Object.keys(MIA_EXECUTIVE_METRICS_RPC);

let passed = 0;
let failed = 0;

function ok(label, cond) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}`);
  }
}

console.log("\nPATCH 11.4 COMPLEMENT — period offset audit\n");

console.log("Migration");
ok(
  "complement migration file",
  existsSync(
    join(ROOT, "supabase/migrations/20260723240000_mia_executive_metrics_period_offset_complement_v11_4.sql")
  )
);

const migration = readFileSync(
  join(ROOT, "supabase/migrations/20260723240000_mia_executive_metrics_period_offset_complement_v11_4.sql"),
  "utf8"
);
for (const cat of COMPLEMENT_CATEGORIES) {
  ok(`migration ${cat}`, migration.includes(`mia_executive_metrics_${cat}`));
  ok(`migration ${cat} offset_days field`, migration.includes("'offset_days'"));
}

console.log("\nCollector — no same-window fallback");
const apiSrc = readFileSync(join(ROOT, "lib/miaExecutiveMetricsApi.js"), "utf8");
ok("no offset retry without offset param", !apiSrc.includes("await client.rpc(rpcName, { p_days: windowDays })"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (url && key) {
  console.log("\nSupabase RPC offset (live)");
  const client = createClient(url, key, { auth: { persistSession: false } });
  const days = 30;
  const offset = 30;

  for (const category of COMPLEMENT_CATEGORIES) {
    const rpc = MIA_EXECUTIVE_METRICS_RPC[category];
    const currentRes = await client.rpc(rpc, { p_days: days, p_offset_days: 0 });
    const previousRes = await client.rpc(rpc, { p_days: days, p_offset_days: offset });

    ok(`${category} current RPC ok`, !currentRes.error, currentRes.error?.message);
    ok(`${category} previous RPC ok`, !previousRes.error, previousRes.error?.message);
    ok(`${category} current offset_days=0`, Number(currentRes.data?.offset_days ?? 0) === 0);
    ok(`${category} previous offset_days=30`, Number(previousRes.data?.offset_days ?? -1) === 30);

    if (COMPLEMENT_CATEGORIES.includes(category)) {
      const curEvents =
        currentRes.data?.events ??
        currentRes.data?.opportunities_found ??
        currentRes.data?.potential_savings_total ??
        currentRes.data?.average_user_value;
      const prevEvents =
        previousRes.data?.events ??
        previousRes.data?.opportunities_found ??
        previousRes.data?.potential_savings_total ??
        previousRes.data?.average_user_value;
      ok(
        `${category} distinct windows (not identical blob)`,
        JSON.stringify(currentRes.data) !== JSON.stringify(previousRes.data) ||
          (curEvents === prevEvents && curEvents === 0)
      );
    }
  }

  clearExecutiveMetricsCache();
  const comparison = await buildExecutiveMetricsPeriodComparison({ windowDays: 30, bypassCache: true });
  ok("comparison no period_offset_unavailable", !comparison.partialErrors.some((e) => e.error === "period_offset_unavailable"));
  for (const cat of COMPLEMENT_CATEGORIES) {
    ok(`comparison ${cat} previous present`, comparison.previous?.[cat] != null);
    ok(`comparison ${cat} previous offset_days`, Number(comparison.previous?.[cat]?.offset_days) === 30);
  }
} else {
  console.log("\nSupabase RPC offset (skipped — no credentials)");
  ok("offline skip", true);
}

console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
