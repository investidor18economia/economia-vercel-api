#!/usr/bin/env node
/**
 * PATCH 3.5 — Identity Layer documentation audit (read-only).
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ANALYTICS = join(ROOT, "docs/analytics");
const AUTH = join(ROOT, "docs/auth");
const ARCH = join(ROOT, "docs/architecture");

let passed = 0;
let failed = 0;

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(label, condition) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${label}`);
  } else {
    failed += 1;
    console.error(`  ❌ ${label}`);
  }
}

function refExists(fromDoc, targetPath) {
  const abs = join(dirname(fromDoc), targetPath.split("#")[0]);
  return existsSync(abs);
}

console.log("\nPATCH 3.5 — identity layer documentation audit\n");

const canonical = join(ANALYTICS, "IDENTITY_LAYER.md");
const auditReport = join(ANALYTICS, "PATCH_3.5_DOCUMENTATION_AUDIT.md");
const archBridge = join(ARCH, "IDENTITY_LAYER.md");
const authBridge = join(AUTH, "IDENTITY_AND_ANALYTICS.md");

assert("IDENTITY_LAYER.md exists", existsSync(canonical));
assert("PATCH_3.5_DOCUMENTATION_AUDIT.md exists", existsSync(auditReport));
assert("architecture/IDENTITY_LAYER.md exists", existsSync(archBridge));
assert("auth/IDENTITY_AND_ANALYTICS.md exists", existsSync(authBridge));

const identityLayer = read(canonical);

for (const term of [
  "visitor_id",
  "session_id",
  "conversation_id",
  "user_id",
  "user_authenticated",
  "analytics_events",
]) {
  assert(`IDENTITY_LAYER mentions ${term}`, identityLayer.includes(term));
}

assert("IDENTITY_LAYER has flow diagram", identityLayer.includes("Fluxograma oficial"));
assert("IDENTITY_LAYER has timeline", identityLayer.includes("Identity Timeline"));
assert("IDENTITY_LAYER references ADR-013", identityLayer.includes("ADR-013"));
assert("IDENTITY_LAYER states single source of truth", /única fonte da verdade/i.test(identityLayer));
assert("IDENTITY_LAYER explains DAU not calculated", identityLayer.includes("DAU"));

const specialized = [
  join(ANALYTICS, "VISITOR_ID.md"),
  join(ANALYTICS, "SESSION_ID.md"),
  join(ANALYTICS, "CONVERSATION_ID.md"),
  join(ANALYTICS, "AUTHENTICATED_IDENTITY.md"),
  join(ANALYTICS, "RETENTION_FOUNDATION.md"),
];

for (const docPath of specialized) {
  const name = docPath.split(/[/\\]/).pop();
  const content = read(docPath);
  assert(`${name} links to IDENTITY_LAYER`, content.includes("IDENTITY_LAYER.md"));
}

const sessionDoc = read(join(ANALYTICS, "SESSION_ID.md"));
assert(
  "SESSION_ID — conversation_id not in localStorage",
  !/conversation_id.*localStorage/i.test(sessionDoc) || /memória|conversationIdRef/i.test(sessionDoc)
);

const conversationDoc = read(join(ANALYTICS, "CONVERSATION_ID.md"));
assert(
  "CONVERSATION_ID — no localStorage as source of truth",
  !/mesmo `conversation_id` via `localStorage`/i.test(conversationDoc)
);
assert("CONVERSATION_ID documents user_authenticated null", conversationDoc.includes("user_authenticated"));

const authIdentityDoc = read(join(ANALYTICS, "AUTHENTICATED_IDENTITY.md"));
assert("AUTHENTICATED_IDENTITY documents user_authenticated step", authIdentityDoc.includes("trackMiaUserAuthenticated"));
assert(
  "AUTHENTICATED_IDENTITY — no '6 primeiros' public events",
  !/6 primeiros/i.test(authIdentityDoc)
);

const retentionDoc = read(join(ANALYTICS, "RETENTION_FOUNDATION.md"));
assert(
  "RETENTION_FOUNDATION — production status not pending deploy",
  !/aguardando deploy/i.test(retentionDoc)
);

const visitorDoc = read(join(ANALYTICS, "VISITOR_ID.md"));
assert(
  "VISITOR_ID — user_id not labeled Supabase Auth",
  !/Usuário autenticado Supabase/i.test(visitorDoc)
);

const eventContract = read(join(ANALYTICS, "contracts/EVENT_CONTRACT.md"));
assert("EVENT_CONTRACT includes user_authenticated", eventContract.includes("user_authenticated"));
assert("EVENT_CONTRACT lists 17 distinct events", /17.*event_name|17.*distintos/i.test(eventContract));

const adr = read(join(ARCH, "ARCHITECTURAL_DECISIONS.md"));
assert("ADR-013 registered", adr.includes("ADR-013"));

const readme = read(join(ANALYTICS, "README.md"));
assert("analytics README links IDENTITY_LAYER", readme.includes("IDENTITY_LAYER.md"));

const changelog = read(join(ANALYTICS, "ANALYTICS_CHANGELOG.md"));
assert("changelog documents PATCH 3.5", changelog.includes("PATCH 3.5"));

const implVisitor = read(join(ROOT, "lib/analytics.js"));
const implChat = read(join(ROOT, "components/MIAChat.jsx"));
assert("impl uses conversationIdRef", implChat.includes("conversationIdRef"));
assert("impl has trackMiaUserAuthenticated", implVisitor.includes("trackMiaUserAuthenticated"));
assert("impl has getOrCreateAnalyticsVisitorId", implVisitor.includes("getOrCreateAnalyticsVisitorId"));

for (const [docPath, target] of [
  [canonical, "./VISITOR_ID.md"],
  [canonical, "./SESSION_ID.md"],
  [canonical, "./CONVERSATION_ID.md"],
  [canonical, "./AUTHENTICATED_IDENTITY.md"],
  [canonical, "./RETENTION_FOUNDATION.md"],
  [canonical, "../auth/AUTHENTICATION_TRUST_FOUNDATION.md"],
  [authBridge, "../analytics/IDENTITY_LAYER.md"],
  [archBridge, "../analytics/IDENTITY_LAYER.md"],
]) {
  const base = docPath.split(/[/\\]/).pop();
  assert(`${base} → ${target} exists`, refExists(docPath, target));
}

console.log(`\nResultado: ${passed}/${passed + failed}`);
process.exit(failed > 0 ? 1 : 0);
