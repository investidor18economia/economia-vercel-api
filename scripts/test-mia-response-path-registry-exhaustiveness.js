/**
 * PATCH 11A.9 — Response Path Registry Exhaustiveness
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  EMITTED_FUNCTIONAL_RESPONSE_PATHS,
  RESPONSE_PATH_CATALOG_VERSION,
} from "../lib/miaResponsePathCatalog.js";
import {
  isPrefixFallbackRegistry,
  listExplicitResponsePathRegistryKeys,
  resolveResponsePathRegistry,
  RUNTIME_PRECEDENCE_VERSION,
} from "../lib/miaRuntimePrecedence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HANDLER_PATH = path.join(__dirname, "..", "pages", "api", "chat-gpt4o.js");

let passed = 0;
let failed = 0;

function expect(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    console.log(`  ✗ ${label}`);
    failed += 1;
  }
}

function extractEmittedPaths(source) {
  const paths = new Set();
  const re = /responsePath:\s*["']([a-z0-9_]+)["']/gi;
  let match;
  while ((match = re.exec(source)) !== null) {
    paths.add(match[1].toLowerCase());
  }
  return [...paths].sort();
}

console.log("\nPATCH 11A.9 — Response Path Registry Exhaustiveness\n");

const handlerSource = fs.readFileSync(HANDLER_PATH, "utf8");
const emittedInHandler = extractEmittedPaths(handlerSource);
const registryKeys = listExplicitResponsePathRegistryKeys();

const emittedButUnregistered = emittedInHandler.filter((pathId) => {
  const registry = resolveResponsePathRegistry(pathId);
  return registry.failClosed === true && !registryKeys.includes(pathId);
});

const prefixAuthorizedFunctionalPaths = emittedInHandler.filter((pathId) => {
  const registry = resolveResponsePathRegistry(pathId);
  return isPrefixFallbackRegistry(registry) && registry.failClosed !== true;
});

const unknownFunctionalPaths = emittedInHandler.filter((pathId) => {
  const registry = resolveResponsePathRegistry(pathId);
  return registry.failClosed === true;
});

console.log("Grupo A — Version alignment");
{
  expect(RUNTIME_PRECEDENCE_VERSION === "11A.9.1", "A: runtime precedence version");
  expect(RESPONSE_PATH_CATALOG_VERSION === "11A.9.1", "A: catalog version");
}

console.log("\nGrupo B — Explicit registry coverage");
{
  expect(emittedButUnregistered.length === 0, `B: emitted paths registered (${emittedButUnregistered.length} gaps)`);
  if (emittedButUnregistered.length) {
    console.log("    unregistered:", emittedButUnregistered.join(", "));
  }
}

console.log("\nGrupo C — Prefix fallback not used for authorization");
{
  expect(prefixAuthorizedFunctionalPaths.length === 0, "C: zero prefix-authorized functional paths");
  expect(
    resolveResponsePathRegistry("commercial_success").failClosed !== true,
    "C: commercial_success explicit"
  );
  expect(
    resolveResponsePathRegistry("completely_unknown_xyz").failClosed === true,
    "C: unknown path fail-closed"
  );
}

console.log("\nGrupo D — Catalog master list");
{
  for (const pathId of EMITTED_FUNCTIONAL_RESPONSE_PATHS) {
    const registry = resolveResponsePathRegistry(pathId);
    expect(registry.failClosed !== true, `D: catalog path ${pathId}`);
  }
}

console.log("\nGrupo E — Counts");
{
  const explicitFunctional = emittedInHandler.filter((pathId) => {
    const registry = resolveResponsePathRegistry(pathId);
    return registry.failClosed !== true && registry.functionalConversationResponse !== false;
  });
  console.log(`  emittedFunctionalPathCount: ${explicitFunctional.length}`);
  console.log(`  explicitlyRegisteredFunctionalPathCount: ${explicitFunctional.length}`);
  console.log(`  prefixAuthorizedFunctionalPathCount: ${prefixAuthorizedFunctionalPaths.length}`);
  console.log(`  unknownFunctionalPathCount: ${unknownFunctionalPaths.length}`);
  expect(prefixAuthorizedFunctionalPaths.length === 0, "E: prefix authorized count zero");
}

console.log(`\nResultado: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
