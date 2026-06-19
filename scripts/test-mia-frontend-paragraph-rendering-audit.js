/**
 * PATCH 9.2C — Frontend Paragraph Rendering Fix Audit
 *
 * Usage:
 *   node scripts/test-mia-frontend-paragraph-rendering-audit.js
 */

import {
  shouldUseStructuredParagraphs,
  splitAssistantParagraphs,
} from "../lib/miaFrontendParagraphRendering.js";

let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? " — " + detail : ""}`);
  }
}

console.log("\nPATCH 9.2C — Frontend Paragraph Rendering Fix Audit\n");

const narrativeReply = [
  "Minha escolha aqui é o iPhone 13: ele entrega a decisão mais segura.",
  "Um detalhe que muita gente ignora: suporte longo de software pesa mais.",
  "Isso costuma importar porque menos preocupação em trocar cedo demais.",
  "✅ O que ganha\n\nMais longevidade\n\n⚠️ O que abre mão\n\nTela de 60 Hz",
  "Por esse perfil de uso, eu iria nele.",
].join("\n\n");

console.log("── splitAssistantParagraphs ──");
const parts = splitAssistantParagraphs(narrativeReply);
assert("multi-block split", parts.length >= 5, `count=${parts.length}`);
assert("preserva conteúdo", parts.join("\n\n") === narrativeReply);
assert("structured mode", shouldUseStructuredParagraphs(narrativeReply));

console.log("\n── casos simples ──");
assert("texto curto sem split", splitAssistantParagraphs("Oi, posso ajudar.").length === 1);
assert("curto não estrutura", !shouldUseStructuredParagraphs("Recomendo este modelo."));
assert("tradeoff preservado", parts.some((p) => /✅/.test(p)) && parts.some((p) => /⚠️/.test(p)));

console.log("\n── validação visual esperada ──");
assert("parágrafos distintos", new Set(parts).size === parts.length);
assert("nenhum parágrafo vazio", parts.every((p) => p.length > 0));

console.log("\n══════════════════════════════════════");
console.log(`Static: ${passed} passed, ${failed} failed`);
console.log(`VEREDITO FINAL: ${failed === 0 ? "A) ROBUST" : "B) PARTIAL"}`);
console.log("══════════════════════════════════════\n");

process.exit(failed === 0 ? 0 : 1);
