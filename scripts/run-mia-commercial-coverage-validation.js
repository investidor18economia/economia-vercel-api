#!/usr/bin/env node
/**
 * PATCH Comercial 05J — Commercial Coverage Validation Runner
 *
 * Default (synthetic, local-only):
 *   node scripts/run-mia-commercial-coverage-validation.js
 *
 * Real controlled (requires explicit opt-in — do not run without authorization):
 *   node scripts/run-mia-commercial-coverage-validation.js --real --allow-external --allow-paid-external --max-products=5
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV,
  COMMERCIAL_COVERAGE_VALIDATION_VERSION,
  buildRealValidationPreflight,
  canExecuteRealCommercialCoverageValidation,
  executeRealCommercialCoverageValidation,
  executeSyntheticCommercialCoverageValidation,
  formatCommercialCoverageConsoleReport,
  readCommercialCoverageValidationConfig,
} from "../lib/commercial/commercialCoverageValidation.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const argv = process.argv.slice(2);
const config = readCommercialCoverageValidationConfig(process.env, argv);

async function main() {
  console.log(`\nCommercial Coverage Validation (${COMMERCIAL_COVERAGE_VALIDATION_VERSION})`);

  if (config.mode === "real") {
    const preflight = buildRealValidationPreflight({ argv, env: process.env });
    console.log("\n── Preflight (estimativa — nenhuma API chamada nesta fase) ──");
    console.log(JSON.stringify(preflight, null, 2));

    const guard = canExecuteRealCommercialCoverageValidation({ argv, env: process.env });
    if (!guard.allowed) {
      console.log("\nExecução real bloqueada.");
      console.log(guard.instructions || "");
      console.log(`\nDefina ${COMMERCIAL_COVERAGE_REAL_VALIDATION_ENABLED_ENV}=true e repita com --real --allow-external.`);
      process.exit(1);
    }

    console.warn("\n⚠️  Execução real autorizada. Chamadas externas podem consumir créditos.\n");
    const report = await executeRealCommercialCoverageValidation({ argv, env: process.env });
    emitReport(report);
    process.exit(report.ok === false ? 1 : 0);
  }

  const report = await executeSyntheticCommercialCoverageValidation({ argv, env: process.env });
  emitReport(report);
  process.exit(report.validation?.ok === false ? 1 : 0);
}

function emitReport(report) {
  console.log(formatCommercialCoverageConsoleReport(report));

  if (config.outputJson) {
    const payload = JSON.stringify(report, null, 2);
    if (config.outputPath) {
      const outputPath = join(ROOT, config.outputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, payload, "utf8");
      console.log(`\nJSON salvo em: ${config.outputPath}`);
    } else {
      console.log("\n── JSON ──");
      console.log(payload);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
