#!/usr/bin/env node
/**
 * PATCH Comercial 05J.8 — Mercado Livre Vault Authenticated Runtime Probe (opt-in, real external)
 *
 * Usage:
 *   COMMERCIAL_ML_VAULT_AUTHENTICATED_PROBE_ENABLED=true \
 *   node scripts/run-mia-mercadolivre-vault-authenticated-probe.js --real --allow-external --vault-authenticated
 *
 * Requires vault persistence configured. MERCADOLIVRE_ACCESS_TOKEN must be unset when vault is active.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildMercadoLivreVaultAuthenticatedRuntimeProbePlan,
  executeMercadoLivreVaultAuthenticatedRuntimeProbe,
} from "../lib/commercial/mercadolivreVaultAuthenticatedRuntimeProbe.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const argv = process.argv.slice(2);

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional local env
  }
}

function readArg(name, fallback = "") {
  const inline = argv.find((entry) => entry.startsWith(`--${name}=`));
  if (inline) return inline.split("=").slice(1).join("=").trim();
  return fallback;
}

async function main() {
  loadEnvLocal();
  const env = process.env;
  const query = readArg("query", "iPhone 13") || "iPhone 13";
  const outputPath = readArg("output", "tmp/mercadolivre-vault-authenticated-probe.json");
  const real = argv.includes("--real");
  const allowExternal = argv.includes("--allow-external");
  const vaultAuthenticated = argv.includes("--vault-authenticated");

  const plan = buildMercadoLivreVaultAuthenticatedRuntimeProbePlan({ env, query });
  console.log("\nPATCH 05J.8 — Vault Authenticated Runtime Probe\n");
  console.log(JSON.stringify(plan, null, 2));

  if (!vaultAuthenticated) {
    console.log("\nProbe blocked: missing --vault-authenticated");
    process.exit(2);
  }
  if (!real) {
    console.log("\nProbe blocked: missing --real");
    process.exit(2);
  }
  if (!allowExternal) {
    console.log("\nProbe blocked: missing --allow-external");
    process.exit(2);
  }

  const report = await executeMercadoLivreVaultAuthenticatedRuntimeProbe({
    env,
    query,
    limit: 1,
    realExecution: true,
    externalCallsAuthorized: true,
  });

  console.log("\n── Vault Authenticated Probe result ──");
  console.log(JSON.stringify(report, null, 2));

  const fullOutputPath = join(ROOT, outputPath);
  mkdirSync(dirname(fullOutputPath), { recursive: true });
  writeFileSync(fullOutputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nJSON saved: ${outputPath}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
