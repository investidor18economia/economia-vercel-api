/**
 * PATCH 5.3C — Testes isolados: buildUnknownProductCorrectionAudit
 *
 * Sem LLM. Sem API. Função pura.
 */

import { buildUnknownProductCorrectionAudit } from "../lib/miaUnknownProductCorrectionAudit.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────
// Fixtures de produtos
// ─────────────────────────────────────────────────────────────

const allowedProducts = [
  { product_name: "Apple iPhone 13 128GB Preto Lacrado" },
  { product_name: "Samsung Galaxy A55 5G 256GB" },
  { product_name: "Motorola Moto G84 5G 256GB" },
];

const anchorProduct = { product_name: "Apple iPhone 13 128GB Preto Lacrado" };

// ─────────────────────────────────────────────────────────────
// Cenário 1: Correção aplicada durante rich explanation ativa
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 1: Correção durante rich explanation ativa");
{
  const rawReply =
    "Eu recomendei o iPhone 13 porque ele tem o melhor equilíbrio custo-benefício. " +
    "O chip A15 Bionic garante performance excelente para o dia a dia. " +
    "O tradeoff é que a câmera perde para modelos mais novos.";

  const correctedReply = "Sobre o iPhone 13, mantendo o que já vimos...";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply,
    allowedProducts,
    anchorProduct,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  assert(audit !== null && typeof audit === "object", "audit nunca retorna null");
  assert(audit.auditVersion === "5.3C", "auditVersion = 5.3C");
  assert(audit.correctionApplied === true, "correctionApplied = true");
  assert(audit.richExplanationActive === true, "richExplanationActive = true");
  assert(audit.contextModeSelected === "explanation_anchored", "contextModeSelected correto");
  assert(audit.anchorProduct === "Apple iPhone 13 128GB Preto Lacrado", "anchorProduct capturado");
  assert(audit.flags.includes("RICH_EXPLANATION_WAS_ACTIVE"), "flag RICH_EXPLANATION_WAS_ACTIVE");
  assert(audit.flags.includes("CORRECTION_OVERRODE_RICH_EXPLANATION"), "flag CORRECTION_OVERRODE_RICH_EXPLANATION");
  assert(audit.flags.includes("ANCHOR_PRESENT"), "flag ANCHOR_PRESENT");
  assert(audit.rawReplyPreview && audit.rawReplyPreview.length <= 200, "rawReplyPreview com até 200 chars");
  assert(audit.correctedReplyPreview && audit.correctedReplyPreview.includes("mantendo"), "correctedReplyPreview capturado");
  assert(typeof audit.likelyFalsePositive === "boolean", "likelyFalsePositive é booleano");
}

// ─────────────────────────────────────────────────────────────
// Cenário 2: Produto desconhecido real — gera flag correta
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 2: Produto desconhecido real");
{
  const rawReply =
    "O Redmi Note 12 seria uma ótima opção para você. " +
    "Ele tem bateria de 5000mAh e câmera de 50MP.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts,
    anchorProduct,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
  });

  assert(audit.likelyFalsePositive === false, "produto real → likelyFalsePositive = false");
  assert(
    audit.flags.includes("UNKNOWN_MENTION_NOT_IN_ALLOWED_PRODUCTS"),
    "flag UNKNOWN_MENTION_NOT_IN_ALLOWED_PRODUCTS"
  );
  assert(audit.triggerCount > 0, "triggerCount > 0 para produto desconhecido real");
  assert(
    audit.suspectedUnknownMentions.length > 0,
    "suspectedUnknownMentions preenchido"
  );
  assert(!audit.flags.includes("RICH_EXPLANATION_WAS_ACTIVE"), "rich não estava ativo");
}

// ─────────────────────────────────────────────────────────────
// Cenário 3: Chip do produto âncora — falso positivo quando
// o chip aparece em frase separada (sem "iPhone 13" na frase)
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 3: Chip A15 em frase isolada — falso positivo esperado");
{
  // A15 aparece em frase sem o nome do produto → guard dispara
  // Mas na verdade é só o chip do próprio produto recomendado
  const rawReply =
    "Recomendei o iPhone 13 para o seu perfil de uso diário. " +
    "Ele usa o chip A15, que entrega performance excelente. " +
    "O tradeoff é que câmeras noturnas ficam atrás dos mais novos.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts,
    anchorProduct,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  // Se o guard disparou (triggerCount > 0), deve detectar como falso positivo
  // Se o guard não disparou, o audit não terá detalhes — ambos cenários válidos
  if (audit.triggerCount > 0) {
    assert(audit.likelyFalsePositive === true, "A15 isolado → likelyFalsePositive = true");
    assert(
      ["tech_spec_or_chip_name", "suspected_anchor_alias", "allowed_product_family_present_in_sentence"].includes(
        audit.falsePositiveReason
      ),
      "falsePositiveReason preenchido"
    );
  } else {
    // Guard não disparou nesta frase — também é comportamento correto
    assert(
      audit.flags.includes("NO_UNKNOWN_MENTION_DETAILS_AVAILABLE") || audit.triggerCount === 0,
      "sem trigger → sem detalhes de menção desconhecida"
    );
    assert(typeof audit.likelyFalsePositive === "boolean", "likelyFalsePositive sempre booleano");
  }
}

// ─────────────────────────────────────────────────────────────
// Cenário 4: Produto permitido — guard NÃO dispara
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 4: Galaxy A55 permitido — guard NÃO dispara");
{
  // "Galaxy A55" está em allowedProducts → allowedFamilyKeys contém "galaxy a55"
  // mentionsAllowed = true para a frase → guard não dispara
  const rawReply =
    "O Galaxy A55 também é uma boa opção para quem prefere Android.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts,
    anchorProduct,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  // Frase com "Galaxy A55" é liberada por mentionsAllowed → triggerCount = 0
  assert(audit.triggerCount === 0, "Galaxy A55 em allowedProducts → triggerCount = 0 (guard não dispara)");
}

// ─────────────────────────────────────────────────────────────
// Cenário 5: Sem detalhes suficientes — flag NO_UNKNOWN_MENTION_DETAILS_AVAILABLE
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 5: Sem detalhes — sem produtos permitidos");
{
  const audit = buildUnknownProductCorrectionAudit({
    rawReply: "",
    correctedReply: "",
    allowedProducts: [],
    anchorProduct: null,
    richExplanationActive: false,
    contextModeSelected: "unknown",
  });

  assert(audit !== null, "audit não é null com input vazio");
  assert(
    audit.flags.includes("NO_UNKNOWN_MENTION_DETAILS_AVAILABLE"),
    "flag NO_UNKNOWN_MENTION_DETAILS_AVAILABLE quando sem detalhes"
  );
  assert(audit.likelyFalsePositive === false, "likelyFalsePositive = false sem dados");
}

// ─────────────────────────────────────────────────────────────
// Cenário 6: audit nunca retorna null
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 6: Input null — audit nunca retorna null");
{
  const audit = buildUnknownProductCorrectionAudit(null);
  assert(audit !== null && typeof audit === "object", "null input → retorna objeto válido");
  assert(audit.auditVersion === "5.3C", "auditVersion mesmo com null input");
}

// ─────────────────────────────────────────────────────────────
// Cenário 7: Audit não muta o input
// ─────────────────────────────────────────────────────────────
console.log("\n🧪 Cenário 7: Audit não muta o input");
{
  const input = {
    rawReply: "O iPhone 13 é ótimo.",
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: [...allowedProducts],
    anchorProduct: { ...anchorProduct },
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  };

  const originalAllowedLength = input.allowedProducts.length;
  buildUnknownProductCorrectionAudit(input);

  assert(input.allowedProducts.length === originalAllowedLength, "allowedProducts não foi mutado");
  assert(input.rawReply === "O iPhone 13 é ótimo.", "rawReply não foi mutado");
  assert(input.anchorProduct.product_name === anchorProduct.product_name, "anchorProduct não foi mutado");
}

// ─────────────────────────────────────────────────────────────
// Resultado final
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// PATCH 5.3D — Tech spec safe-list (via audit module espelhado)
// Testa que specs técnicas NÃO disparam o guard e produtos
// desconhecidos reais CONTINUAM disparando.
// ─────────────────────────────────────────────────────────────

const allowedProductsFor53D = [
  { product_name: "Apple iPhone 13 128GB Preto Lacrado" },
  { product_name: "Samsung Galaxy A55 5G 256GB" },
  { product_name: "Motorola Moto G84 5G 256GB" },
];
const anchorFor53D = { product_name: "Apple iPhone 13 128GB Preto Lacrado" };

// ── Deve NÃO disparar (triggerCount = 0) ──────────────────────

console.log("\n🧪 5.3D — Cenário A: chip A15 isolado NÃO dispara guard");
{
  // A15 aparece sozinho em uma frase — iPhone 13 está em outra frase
  const rawReply =
    "Recomendei o iPhone 13 para o seu perfil. " +
    "Ele usa o chip A15, que entrega performance constante.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  assert(audit.triggerCount === 0, "chip A15 isolado → triggerCount = 0 (não dispara guard)");
}

console.log("\n🧪 5.3D — Cenário B: iOS 17 NÃO dispara guard");
{
  const rawReply =
    "O iPhone 13 ainda recebe atualizações. " +
    "O iOS 17 garante suporte até 2026.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  assert(audit.triggerCount === 0, "iOS 17 → triggerCount = 0 (não dispara guard)");
}

console.log("\n🧪 5.3D — Cenário C: Android 14 isolado NÃO dispara guard");
{
  // "android" tem 7 chars — fora do padrão \b[a-z]{1,5}\s?\d{1,4}\b
  // E não está na lista de marcas. Logo, nunca dispara o regex suspeito.
  const rawReply =
    "Após atualizar para o Android 14, o desempenho melhora bastante. " +
    "O iPhone 13 se beneficia disso.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  assert(audit.triggerCount === 0, "Android 14 → triggerCount = 0 (7 chars, nunca dispara regex)");
}

console.log("\n🧪 5.3D — Cenário D: WiFi 6 NÃO dispara guard");
{
  const rawReply =
    "O iPhone 13 suporta WiFi 6, o que melhora a velocidade em redes modernas.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  // A frase tem "iphone" e "WiFi 6" — iphone 13 está nos allowed → mentionsAllowed = true
  // Então não dispara de qualquer forma
  assert(audit.triggerCount === 0, "WiFi 6 com produto permitido → não dispara");
}

// ── Deve CONTINUAR disparando (triggerCount > 0) ──────────────

console.log("\n🧪 5.3D — Cenário E: iPhone 15 desconhecido com redirect DISPARA guard");
{
  // PATCH 5.4C: o guard só dispara quando há linguagem de redirecionamento.
  // "teria melhor câmera, mas não é necessário" = menção contextual → NÃO dispara.
  // "seria melhor para você" = redirect explícito → DISPARA.
  const rawReply2 =
    "Recomendei o iPhone 13. " +
    "O iPhone 15 seria melhor para você nesse caso.";  // redirect explícito

  const audit2 = buildUnknownProductCorrectionAudit({
    rawReply: rawReply2,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  assert(audit2.triggerCount > 0, "iPhone 15 com 'seria melhor' DISPARA guard (redirect explícito)");
  assert(audit2.likelyFalsePositive === false, "iPhone 15 não é falso positivo");
  assert(audit2.decisionRedirectDetected === true, "decisionRedirectDetected = true");
  assert(audit2.flags.includes("DECISION_REDIRECT_DETECTED"), "flag DECISION_REDIRECT_DETECTED presente");
}

console.log("\n🧪 5.3D — Cenário F: Galaxy S25 desconhecido DISPARA guard");
{
  const rawReply =
    "Você poderia considerar o Galaxy S25, que tem câmera superior.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
  });

  assert(audit.triggerCount > 0, "Galaxy S25 desconhecido DISPARA guard");
}

console.log("\n🧪 5.3D — Cenário G: Poco X7 desconhecido DISPARA guard");
{
  // Poco X7 em frase separada (sem iPhone 13 na mesma frase)
  // para que mentionsAllowed = false e o guard dispare
  const rawReply =
    "Recomendei o iPhone 13. " +
    "O Poco X7 seria uma opção superior nesse caso.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
  });

  // "poco" está na brand list → dispara (frase 2 não tem produto permitido)
  assert(audit.triggerCount > 0, "Poco X7 em frase separada DISPARA guard");
}

console.log("\n🧪 5.3D — Cenário H: iPhone 13 permitido NÃO dispara guard");
{
  const rawReply =
    "O iPhone 13 continua sendo a melhor escolha dentro do que discutimos.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: allowedProductsFor53D,
    anchorProduct: anchorFor53D,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
  });

  assert(audit.triggerCount === 0, "iPhone 13 permitido → triggerCount = 0");
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.3E — Anchor Product Guard Inclusion
// ─────────────────────────────────────────────────────────────

console.log("\n🧪 5.3E — Cenário I: winner (iPhone 13) incluído via autoridade NÃO dispara guard");
{
  const winnerAnchor = { product_name: "Apple iPhone 13 128GB Preto Lacrado" };
  const allowedWithAnchor = [winnerAnchor];
  const rawReply =
    "Recomendei o iPhone 13 porque ele tem o melhor equilíbrio para o seu perfil.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: allowedWithAnchor,
    anchorProduct: winnerAnchor,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
    decisionAuthorityProducts: [winnerAnchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "iPhone 13 como anchor incluído → triggerCount = 0");
  assert(audit.authorityInclusionApplied === true, "authorityInclusionApplied = true");
  assert(audit.anchorIncluded === true, "anchorIncluded = true");
  assert(audit.decisionAuthorityProducts.length > 0, "decisionAuthorityProducts preenchido");
  assert(audit.flags.includes("ANCHOR_INCLUDED_IN_ALLOWED"), "flag ANCHOR_INCLUDED_IN_ALLOWED");
  assert(audit.flags.includes("AUTHORITY_INCLUSION_APPLIED"), "flag AUTHORITY_INCLUSION_APPLIED");
}

console.log("\n🧪 5.3E — Cenário J: winner (Lenovo LOQ) incluído via autoridade NÃO dispara guard");
{
  const winnerLenovo = { product_name: "Lenovo LOQ 15IRH8 Intel Core i5 16GB RAM" };
  const rawReply =
    "O Lenovo LOQ continua fazendo mais sentido para o seu uso em jogos casuais.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [winnerLenovo],
    anchorProduct: winnerLenovo,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
    decisionAuthorityProducts: [winnerLenovo],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "Lenovo LOQ como anchor → triggerCount = 0");
  assert(audit.anchorIncluded === true, "Lenovo LOQ anchorIncluded = true");
}

console.log("\n🧪 5.3E — Cenário K: winner (Sony ZV-E10) incluído via autoridade NÃO dispara guard");
{
  const winningSony = { product_name: "Sony ZV-E10 Camera Mirrorless APS-C" };
  const rawReply =
    "A Sony ZV-E10 foi escolhida porque entrega a melhor qualidade de vídeo na faixa de preço.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [winningSony],
    anchorProduct: winningSony,
    richExplanationActive: true,
    contextModeSelected: "explanation_anchored",
    decisionAuthorityProducts: [winningSony],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "Sony ZV-E10 como anchor → triggerCount = 0");
  assert(audit.anchorIncluded === true, "Sony ZV-E10 anchorIncluded = true");
}

console.log("\n🧪 5.3E — Cenário L: Galaxy S25 com redirect BLOQUEIA quando winner = iPhone 13");
{
  // PATCH 5.4C: "teria melhor câmera" = comparação factual, menção contextual → NÃO bloqueia.
  // Usar redirect explícito ("seria melhor para você") para confirmar que o guard atua.
  const winnerAnchor = { product_name: "Apple iPhone 13 128GB Preto Lacrado" };
  const rawReply =
    "Recomendei o iPhone 13. " +
    "O Galaxy S25 seria melhor para você.";  // redirect explícito

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: [winnerAnchor],
    anchorProduct: winnerAnchor,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [winnerAnchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount > 0, "Galaxy S25 com 'seria melhor' DISPARA guard (redirect, não menção contextual)");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
}

console.log("\n🧪 5.3E — Cenário M: Dell XPS 15 bloqueado quando winner = Lenovo LOQ");
{
  const winnerLenovo = { product_name: "Lenovo LOQ 15IRH8 Intel Core i5 16GB RAM" };
  const rawReply =
    "Recomendei o Lenovo LOQ. " +
    "O Dell XPS 15 seria superior nesse caso.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o Lenovo LOQ...",
    allowedProducts: [winnerLenovo],
    anchorProduct: winnerLenovo,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [winnerLenovo],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount > 0, "Dell XPS 15 não autorizado DISPARA guard quando winner é Lenovo LOQ");
}

console.log("\n🧪 5.3E — Campos de autoridade presentes sem inclusão aplicada");
{
  const audit = buildUnknownProductCorrectionAudit({
    rawReply: "O iPhone 13 é ótimo.",
    correctedReply: "",
    allowedProducts: [{ product_name: "Apple iPhone 13 128GB Preto Lacrado" }],
    anchorProduct: { product_name: "Apple iPhone 13 128GB Preto Lacrado" },
    richExplanationActive: false,
    contextModeSelected: "unknown",
    decisionAuthorityProducts: [],
    authorityInclusionApplied: false,
  });

  assert(audit.authorityInclusionApplied === false, "authorityInclusionApplied = false quando não aplicado");
  assert(Array.isArray(audit.decisionAuthorityProducts), "decisionAuthorityProducts sempre array");
  assert(typeof audit.anchorIncluded === "boolean", "anchorIncluded sempre booleano");
  assert(typeof audit.winnerIncluded === "boolean", "winnerIncluded sempre booleano");
  assert(!audit.flags.includes("AUTHORITY_INCLUSION_APPLIED"), "sem flag AUTHORITY_INCLUSION_APPLIED quando não aplicado");
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.3F — Regex Word Boundary Fix
// ─────────────────────────────────────────────────────────────

console.log("\n🧪 5.3F — Cenário O: 'algo' não gera match 'lg'");
{
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "Ele não tem suporte para carregamento rápido tão eficiente quanto algo que usa carga rápida dedicada.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount === 0, "Frase com 'algo' NÃO dispara guard (sem produto desconhecido)");
  assert(!audit.flags.includes("GUARD_TRIGGERED"), "Flag GUARD_TRIGGERED ausente quando só há 'algo'");
}

console.log("\n🧪 5.3F — Cenário P: 'monitoramento' não gera match 'monitor'");
{
  const anchor = { product_name: "Samsung Galaxy A55 256GB" };
  const rawReply =
    "O monitoramento de desempenho e o processamento das tarefas ficam mais eficientes.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount === 0, "Frase com 'monitoramento' NÃO dispara guard");
}

console.log("\n🧪 5.3F — Cenário Q: 'consultar' e 'tecnologia' não disparam guard");
{
  const anchor = { product_name: "Moto G84 256GB" };
  const rawReply =
    "Você pode consultar os resultados de tecnologia para confirmar o desempenho real.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount === 0, "'consultar' e 'tecnologia' NÃO disparam guard");
}

console.log("\n🧪 5.3F — Cenário R: resposta rica com 'algo', 'algum', 'alguns' não dispara");
{
  const anchor = { product_name: "Xiaomi Redmi Note 13 Pro 256GB" };
  const rawReply =
    "O Redmi Note 13 Pro é a melhor escolha. " +
    "Ele não tem algo que o concorrente oferece em câmera, mas o processamento cobre algum ganho. " +
    "Alguns usuários preferem esse equilíbrio de custo-benefício.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount === 0, "'algo', 'algum', 'alguns' NÃO disparam guard com anchor correto");
}

console.log("\n🧪 5.3F — Cenário S: iPhone 15 AINDA dispara quando não autorizado (regressão)");
{
  const anchor = { product_name: "Samsung Galaxy A55 256GB" };
  const rawReply =
    "O Galaxy A55 é bom. Mas o iPhone 15 seria superior nesse critério.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o Galaxy A55...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount > 0, "iPhone 15 não autorizado AINDA dispara guard após fix de boundary");
}

console.log("\n🧪 5.3F — Cenário T: redirect explícito de Galaxy S25 / Poco X7 AINDA dispara (regressão)");
{
  // PATCH 5.4C: "tem câmera melhor" = factual, menção contextual → sem redirect.
  // Usar linguagem de redirect explícita para confirmar que o guard atua.
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "O iPhone 13 é sólido. " +
    "O Galaxy S25 seria melhor para você. " +
    "Eu recomendaria o Poco X7 nesse caso.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount > 0, "Galaxy S25 / Poco X7 com redirect AINDA disparam guard");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
  assert(audit.flags.includes("DECISION_REDIRECT_DETECTED"), "flag DECISION_REDIRECT_DETECTED");
}

console.log("\n🧪 5.3F — Cenário U: ROG Phone 9 com recomendação explícita AINDA dispara");
{
  // PATCH 5.4C: "seria mais potente" = comparação qualitativa sem "melhor/superior".
  // Usar "recomendaria" para garantir que redirect seja detectado.
  const anchor = { product_name: "Samsung Galaxy A55 256GB" };
  const rawReply =
    "O Galaxy A55 é bom para o dia a dia. " +
    "Eu recomendaria o ROG Phone 9 para jogos pesados.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o Galaxy A55...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount > 0, "ROG Phone 9 com 'recomendaria' AINDA dispara guard");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
}

// ─────────────────────────────────────────────────────────────
// PATCH 5.4C — Guard de intenção de redirecionamento
// ─────────────────────────────────────────────────────────────

console.log("\n🧪 5.4C — Cenário V: MacBook como contexto de ecossistema NÃO bloqueia");
{
  // Cenário do prompt: LLM menciona MacBook como contexto explicativo.
  // Não é recomendação — é contexto de ecossistema.
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "O iPhone 13 se destaca pela integração com o ecossistema Apple. " +
    "Se você já usa MacBook, a integração com o iPhone ajuda no dia a dia. " +
    "Essa foi a principal razão da recomendação.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "MacBook como contexto de ecossistema → triggerCount = 0");
  assert(audit.contextualMentionAllowed === true, "contextualMentionAllowed = true");
  assert(audit.guardIntentMode === "contextual_mention_allowed", "guardIntentMode = contextual_mention_allowed");
  assert(audit.flags.includes("CONTEXTUAL_UNKNOWN_MENTION_ALLOWED"), "flag CONTEXTUAL_UNKNOWN_MENTION_ALLOWED");
  assert(audit.flags.includes("UNKNOWN_MENTION_CONTEXTUAL"), "flag UNKNOWN_MENTION_CONTEXTUAL");
}

console.log("\n🧪 5.4C — Cenário W: comparação com preservação explícita do winner NÃO bloqueia");
{
  // LLM compara com modelo mais novo mas explicitamente preserva o winner.
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "O iPhone 13 foi a melhor escolha para o seu perfil. " +
    "O iPhone 15 seria melhor em câmera, mas isso não muda a recomendação.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "iPhone 15 com 'não muda a recomendação' → NÃO bloqueia");
  assert(audit.contextualMentionAllowed === true, "contextualMentionAllowed = true");
  assert(audit.guardIntentMode === "contextual_mention_allowed", "guardIntentMode = contextual_mention_allowed");
}

console.log("\n🧪 5.4C — Cenário X: Apple Watch / AirPods como contexto de ecossistema NÃO bloqueia");
{
  // Menção de acessórios do ecossistema como contexto — sem redirect.
  // Nota: "Apple Watch" e "AirPods" não estão na lista de tokens suspeitos
  // (não são marcas da lista nem padrão [a-z]{1,5}\d{1,4}), portanto o guard
  // simplesmente não os detecta → triggerCount = 0 sem contextual tracking.
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "O iPhone 13 é a escolha certa para o seu perfil. " +
    "Se você tem Apple Watch ou AirPods, o ecossistema fica ainda mais conveniente.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "Apple Watch / AirPods como ecossistema → NÃO bloqueia");
  // guardIntentMode = no_unknown_mention pois os tokens não são suspeitos
  assert(audit.guardIntentMode === "no_unknown_mention", "guardIntentMode = no_unknown_mention (tokens não detectados como suspeitos)");
}

console.log("\n🧪 5.4C — Cenário Y: recomendação explícita de Galaxy S25 BLOQUEIA");
{
  // Verb of recommendation = clear redirect → should block.
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "Considerando seu perfil, recomendo o Galaxy S25 como melhor opção.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount > 0, "recomendo Galaxy S25 → BLOQUEIA");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
  assert(audit.guardIntentMode === "decision_redirect", "guardIntentMode = decision_redirect");
  assert(audit.flags.includes("DECISION_REDIRECT_DETECTED"), "flag DECISION_REDIRECT_DETECTED");
  assert(!audit.contextualMentionAllowed, "contextualMentionAllowed = false");
}

console.log("\n🧪 5.4C — Cenário Z: 'eu trocaria pelo MacBook' BLOQUEIA");
{
  // Troca explícita = redirect → should block.
  const anchor = { product_name: "Lenovo LOQ 15IRH8 Intel Core i5 16GB RAM" };
  const rawReply =
    "O Lenovo LOQ atende bem. " +
    "Mas eu trocaria pelo MacBook Pro se o orçamento permitir.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o Lenovo LOQ...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount > 0, "'eu trocaria pelo MacBook' → BLOQUEIA");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
  assert(audit.guardIntentMode === "decision_redirect", "guardIntentMode = decision_redirect");
}

console.log("\n🧪 5.4C — Cenário AA: 'poderia considerar o Galaxy S25' BLOQUEIA");
{
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "Você poderia considerar o Galaxy S25, que tem câmera superior.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: false,
    contextModeSelected: "context_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: false,
  });

  assert(audit.triggerCount > 0, "'poderia considerar Galaxy S25' → BLOQUEIA");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
}

console.log("\n🧪 5.4C — Cenário AB: guardIntentMode = no_unknown_mention quando sem produto externo");
{
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "O iPhone 13 é a escolha certa para o seu perfil de uso diário.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: false,
    contextModeSelected: "explanation_anchored",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount === 0, "apenas produto permitido → triggerCount = 0");
  assert(audit.guardIntentMode === "no_unknown_mention", "guardIntentMode = no_unknown_mention");
  assert(!audit.decisionRedirectDetected, "decisionRedirectDetected = false");
  assert(!audit.contextualMentionAllowed, "contextualMentionAllowed = false");
}

console.log("\n🧪 5.4C — Cenário AC: 'a melhor escolha seria o Poco X7' BLOQUEIA");
{
  const anchor = { product_name: "Apple iPhone 13 128GB Preto" };
  const rawReply =
    "A melhor escolha seria o Poco X7 para o seu orçamento.";

  const audit = buildUnknownProductCorrectionAudit({
    rawReply,
    correctedReply: "Sobre o iPhone 13...",
    allowedProducts: [anchor],
    anchorProduct: anchor,
    richExplanationActive: true,
    contextModeSelected: "cognitive_anchor_hold",
    decisionAuthorityProducts: [anchor],
    authorityInclusionApplied: true,
  });

  assert(audit.triggerCount > 0, "'a melhor escolha seria Poco X7' → BLOQUEIA");
  assert(audit.decisionRedirectDetected === true, "decisionRedirectDetected = true");
  assert(audit.guardIntentMode === "decision_redirect", "guardIntentMode = decision_redirect");
}

// ─────────────────────────────────────────────────────────────
// Resultado final
// ─────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}  Total: ${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
