/**
 * PATCH 11B.4 — Final Conversational Production Validation (API matrix)
 */
import {
  loadEnvKey,
  ConversationSession,
  createReporter,
  GENERIC_ONLY,
} from "./test-mia-11b4-shared.mjs";

const API_KEY = loadEnvKey();
if (!API_KEY) {
  console.error("API_SHARED_KEY missing");
  process.exit(1);
}

const { record, summary } = createReporter("11B.4");

console.log("\nPATCH 11B.4 — Final Conversational Production Validation (API)\n");

function socialOk(r) {
  return r.http200 && r.pricesCount === 0 && r.paidExternal === 0 && !r.replyGenericOnly && r.replyLen > 15;
}

function commercialOk(r) {
  return r.http200 && r.replyLen > 40 && !r.replyGenericOnly;
}

function clarifyOk(r) {
  return (
    r.http200 &&
    r.paidExternal === 0 &&
    r.pricesCount === 0 &&
    (r.reply.includes("?") ||
      /qual|refer|orçamento|produto|contexto|histórico|opção|recomenda|anterior|valida/i.test(r.reply))
  );
}

function followUpOk(r) {
  return r.http200 && !r.replyGenericOnly && r.replyLen > 12;
}

// ── FASE 4 — PATCH 11B SOCIAL ──
const socialTexts = [
  "acho esse Galaxy bonito",
  "estou cansado de pesquisar celular",
  "meu celular está velho",
  "não gosto de Samsung",
  "comprar online dá medo",
  "celular hoje está muito caro",
  "iPhone parece bonito",
  "notebook me dá dor de cabeça",
];
for (const text of socialTexts) {
  const s = new ConversationSession({ conversationId: `11b4-social-${text.slice(0, 12)}` });
  const r = await s.send(API_KEY, text);
  record(`11B social: ${text.slice(0, 40)}`, socialOk(r), {
    paidExternal: r.paidExternal,
    pricesCount: r.pricesCount,
    replySnippet: r.reply.slice(0, 70),
  });
}

// ── FASE 5 — PATCH 11B.1 FOLLOW-UP ──
const fu = new ConversationSession({ conversationId: `11b4-followup-${Date.now()}` });
const fuFlow = [
  { text: "qual celular você recomenda até 2500?", check: commercialOk },
  { text: "e quanto custa?", check: (r) => followUpOk(r) && /\bR\$\s*[\d.,]+|pre[cç]o|valor|custa/i.test(r.reply) },
  { text: "e bateria?", check: followUpOk },
  { text: "e a segunda opção?", check: followUpOk },
  { text: "vale a pena mesmo?", check: followUpOk },
];
for (const step of fuFlow) {
  const r = await fu.send(API_KEY, step.text);
  record(`11B.1 follow-up: ${step.text}`, step.check(r), {
    anchor: r.anchor,
    replySnippet: r.reply.slice(0, 80),
    paidExternal: r.paidExternal,
  });
}

// ── FASE 6 — PATCH 11B.2 MIXED ──
const mixedTexts = [
  "estou cansado de pesquisar, mas quero um celular até 2500.",
  "tenho medo de me arrepender, qual celular você recomenda?",
  "acho o iPhone bonito, mas vale a pena comprar?",
  "não gosto de Samsung, mas quero um celular com boa bateria.",
  "meu último celular travava, quero um mais rápido até 3000.",
];
for (const text of mixedTexts) {
  const s = new ConversationSession({ conversationId: `11b4-mixed-${Date.now()}` });
  const r = await s.send(API_KEY, text);
  record(`11B.2 mixed: ${text.slice(0, 45)}`, r.http200 && r.replyLen > 40 && !r.replyGenericOnly, {
    replySnippet: r.reply.slice(0, 80),
    paidExternal: r.paidExternal,
  });
}

// ── FASE 7 — PATCH 11B.3 REFINEMENT (6 turnos) ──
const rf = new ConversationSession({ conversationId: `11b4-refine-${Date.now()}` });
const rfSteps = [
  { text: "qual celular você recomenda até 3000?", ok: commercialOk },
  { text: "quero mais bateria", ok: followUpOk },
  {
    text: "sem iPhone",
    ok: (r) => followUpOk(r) && !/iPhone 13|iPhone 11|iPhone 14/i.test(r.reply),
  },
  { text: "mas preciso de 256 GB", ok: followUpOk },
  { text: "tem um mais barato?", ok: followUpOk },
  { text: "esse vale a pena mesmo?", ok: followUpOk },
];
for (const step of rfSteps) {
  const r = await rf.send(API_KEY, step.text);
  record(`11B.3 refinement: ${step.text}`, step.ok(r), {
    anchor: r.anchor,
    budgetMax: r.budgetMax,
    excludedBrands: r.excludedBrands,
    paidExternal: r.paidExternal,
    replySnippet: r.reply.slice(0, 80),
  });
}

// ── FASE 8 — SEM CONTEXTO ──
for (const text of [
  "tem um mais barato?",
  "quero mais bateria",
  "sem iPhone",
  "preciso de 256 GB",
  "e a segunda opção?",
  "vale a pena mesmo?",
]) {
  const s = new ConversationSession({ conversationId: `11b4-nctx-${Date.now()}-${Math.random().toString(36).slice(2, 5)}` });
  const r = await s.send(API_KEY, text);
  record(`no context: ${text}`, clarifyOk(r), { replySnippet: r.reply.slice(0, 70), paidExternal: r.paidExternal });
}

// ── FASE 9 — TOPIC SWITCH ──
const ts = new ConversationSession({ conversationId: `11b4-topic-${Date.now()}` });
await ts.send(API_KEY, "qual celular até 2500?");
const ts2 = await ts.send(API_KEY, "mudando de assunto, como você está?");
record("topic switch after commercial", ts2.http200 && ts2.paidExternal === 0 && !ts2.replyGenericOnly, {
  replySnippet: ts2.reply.slice(0, 60),
});

const ts3s = new ConversationSession({ conversationId: `11b4-topic2-${Date.now()}` });
await ts3s.send(API_KEY, "me recomenda um notebook.");
const ts3 = await ts3s.send(API_KEY, "deixa isso para depois, quero só conversar.");
record("commercial suspend conversation", ts3.http200 && ts3.paidExternal === 0, {
  replySnippet: ts3.reply.slice(0, 70),
});

// ── FASE 10 — CANCELAMENTO ──
for (const text of [
  "não quero comprar agora, só estou comentando.",
  "não precisa pesquisar, estou apenas desabafando.",
  "esquece a recomendação, quero só conversar.",
  "não quero ver ofertas agora.",
]) {
  const s = new ConversationSession({ conversationId: `11b4-deny-${Date.now()}` });
  const r = await s.send(API_KEY, text);
  record(`denial: ${text.slice(0, 40)}`, r.http200 && r.paidExternal === 0 && r.pricesCount === 0, {
    paidExternal: r.paidExternal,
    pricesCount: r.pricesCount,
  });
}

// ── FASE 11 — MUDANÇA DE CATEGORIA ──
const cat = new ConversationSession({ conversationId: `11b4-cat-${Date.now()}` });
await cat.send(API_KEY, "quero um celular até 2500.");
await cat.send(API_KEY, "sem iPhone.");
await cat.send(API_KEY, "quero mais bateria.");
const cat4 = await cat.send(API_KEY, "agora quero um notebook até 4000.");
record("category switch notebook", cat4.http200 && /notebook|dell|lenovo|acer|hp/i.test(cat4.reply.toLowerCase()), {
  category: cat4.category,
  budgetMax: cat4.budgetMax,
  excludedFromPhone: !cat4.excludedBrands?.includes?.("apple") || cat4.budgetMax === 4000,
  replySnippet: cat4.reply.slice(0, 80),
});

// ── FASE 14 — GENERALIZAÇÃO ──
const genCases = [
  "quero uma geladeira mais barata",
  "sem Nike",
  "quero um perfume mais suave",
  "preciso de uma cadeira menor",
  "tem um aspirador mais silencioso?",
];
for (const text of genCases) {
  const s = new ConversationSession({ conversationId: `11b4-gen-${Date.now()}` });
  const r = await s.send(API_KEY, text);
  record(`category-agnostic: ${text}`, r.http200 && (clarifyOk(r) || r.replyLen > 20), {
    replySnippet: r.reply.slice(0, 70),
    paidExternal: r.paidExternal,
  });
}

// ── FASE 25 — CONCORRÊNCIA ──
const sessA = new ConversationSession({ conversationId: `11b4-conc-a-${Date.now()}`, userId: "conc-a" });
const sessB = new ConversationSession({ conversationId: `11b4-conc-b-${Date.now()}`, userId: "conc-b" });
const a1 = await sessA.send(API_KEY, "quero um celular até 2500.");
const b1 = await sessB.send(API_KEY, "quero um notebook até 5000.");
await sessA.send(API_KEY, "sem iPhone.");
await sessB.send(API_KEY, "prefiro Dell.");
const a4 = await sessA.send(API_KEY, "tem um mais barato?");
const b4 = await sessB.send(API_KEY, "quero um mais leve.");
record(
  "concurrency isolation A vs B",
  sessA.conversationId !== sessB.conversationId &&
    a1.anchor &&
    b1.anchor &&
    a1.anchor !== b1.anchor &&
    !a4.reply.toLowerCase().includes("notebook") &&
    !b4.reply.toLowerCase().includes("iphone") &&
    !b4.reply.toLowerCase().includes("galaxy s23"),
  {
    convA: sessA.conversationId,
    convB: sessB.conversationId,
    anchorA: a4.anchor,
    anchorB: b4.anchor,
    budgetA: a4.budgetMax,
    budgetB: b4.budgetMax,
  }
);

// ── FASE 40 — FLUXO COMPLETO 12 TURNOS ──
const full = new ConversationSession({ conversationId: `11b4-full-${Date.now()}` });
const fullFlow = [
  "estou cansado de pesquisar celular, mas quero um até 3000.",
  "e quanto custa?",
  "quero mais bateria.",
  "sem iPhone.",
  "preciso de 256 GB.",
  "tem um mais barato?",
  "esse vale a pena mesmo?",
  "mudando de assunto, como você está?",
  "agora quero um notebook até 4000.",
  "prefiro Dell.",
  "quero um mais leve.",
  "pode passar um pouco do orçamento.",
];
let fullFail = false;
for (let i = 0; i < fullFlow.length; i++) {
  const r = await full.send(API_KEY, fullFlow[i]);
  if (!r.http200 || r.httpStatus >= 500) fullFail = true;
  if (i === 3 && /iPhone 13|iPhone 11/i.test(r.reply)) fullFail = true;
  if (i === 7 && r.paidExternal > 0) fullFail = true;
}
record("full 12-turn production flow", !fullFail, {
  turns: full.turns.length,
  finalCategory: full.sessionContext?.lastCategory,
  finalBudget: full.sessionContext?.budgetMax,
});

// ── PAID EXTERNAL AUDIT on initial commercial search ──
const paidAudit = new ConversationSession({ conversationId: `11b4-paid-${Date.now()}` });
const pa = await paidAudit.send(API_KEY, "qual celular você recomenda até 2500?");
record(
  "paidExternal audit new search",
  pa.http200 && pa.paidExternal >= 0,
  {
    paidExternal: pa.paidExternal,
    providerExecuted: pa.providerExecuted,
    note: pa.paidExternal > 0 ? "NECESSÁRIA if catalog fetch" : "EVITÁVEL/none",
  }
);
const pa2 = await paidAudit.send(API_KEY, "e quanto custa?");
record(
  "paidExternal audit price follow-up",
  pa2.http200 && pa2.paidExternal === 0,
  { paidExternal: pa2.paidExternal, followUpType: pa2.followUpType }
);

const s = summary();
console.log("\n=== PATCH 11B.4 API SUMMARY ===");
console.log(JSON.stringify(s, null, 2));
process.exit(s.failed > 0 ? 1 : 0);
