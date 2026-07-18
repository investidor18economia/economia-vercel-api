#!/usr/bin/env node
/**
 * PATCH Comercial 05K.3 — Mercado Livre OAuth Credential Validation Probe (opt-in, real external)
 *
 * Usage:
 *   COMMERCIAL_ML_OAUTH_CREDENTIAL_VALIDATION_PROBE_ENABLED=true \
 *   MERCADOLIVRE_OAUTH_VAULT_ENVIRONMENT=production \
 *   node scripts/run-mia-mercadolivre-oauth-credential-validation-probe.js \
 *     --real --allow-external --vault-authenticated --max-calls=2
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditMercadoLivreOAuthVaultCredentialState,
  executeMercadoLivreOAuthCredentialValidationProbe,
  MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION,
} from "../lib/commercial/mercadolivreOAuthCredentialValidationProbe.js";

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
    // optional
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
  const query = readArg("query", "Galaxy S24") || "Galaxy S24";
  const outputPath = readArg("output", "tmp/mercadolivre-oauth-credential-validation-probe.json");
  const maxCalls = Number.parseInt(readArg("max-calls", "2"), 10) || 2;
  const real = argv.includes("--real");
  const allowExternal = argv.includes("--allow-external");
  const vaultAuthenticated = argv.includes("--vault-authenticated");

  console.log(`\nPATCH 05K.3 — OAuth Credential Validation Probe (${MERCADOLIVRE_OAUTH_CREDENTIAL_VALIDATION_PROBE_VERSION})\n`);

  const vaultAudit = await auditMercadoLivreOAuthVaultCredentialState({ env });
  console.log("── Vault audit (sanitized) ──");
  console.log(JSON.stringify(vaultAudit, null, 2));

  if (!vaultAuthenticated) {
    console.log("\nProbe blocked: missing --vault-authenticated");
    process.exit(2);
  }
  if (!real) {
    console.log("\nDry run only. Pass --real --allow-external to execute external validation.");
    process.exit(0);
  }
  if (!allowExternal) {
    console.log("\nProbe blocked: missing --allow-external");
    process.exit(2);
  }

  const report = await executeMercadoLivreOAuthCredentialValidationProbe({
    env,
    query,
    maxCalls,
    realExecution: true,
    externalCallsAuthorized: true,
    vaultAuthenticated: true,
  });

  console.log("\n── Validation probe result ──");
  console.log(JSON.stringify(report, null, 2));

  const fullOutputPath = join(ROOT, outputPath);
  mkdirSync(dirname(fullOutputPath), { recursive: true });
  writeFileSync(fullOutputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(`\nJSON saved: ${outputPath}`);

  process.exit(report.blocked ? 2 : report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
