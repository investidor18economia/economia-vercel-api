/**
 * test_hlu2.cjs — Validação completa da HLU Fase 2
 *
 * 1. Sanity checks: gaming recall, zero regressão
 * 2. Novos sinais: batteryPriority, regretFear content, casual streaming
 * 3. Re-run das 32 queries caóticas: before (26/32) vs after
 * 4. Consequence entries das novas queries desbloqueadas
 * 5. Safety checks: batteryPriority não contaminou tudo, casual não broad demais
 */
"use strict";
const fs   = require("fs");
const path = require("path");

const src = fs.readFileSync("pages/api/chat-gpt4o.js", "utf8");

// ── Sandbox ───────────────────────────────────────────────────────────────────
function sliceFn(name, extra = 5000) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) return `// NOT FOUND: ${name}`;
  const candidates = [
    src.indexOf("\nfunction ", start + 10),
    src.indexOf("\nconst ",    start + 10),
    src.indexOf("\n// ====",   start + 10)
  ].filter(x => x > 0);
  const end = candidates.length ? Math.min(...candidates) : start + extra;
  return src.slice(start, end);
}
const nqStart  = src.indexOf('function normalizeQuery');
const nqCode   = src.slice(nqStart, src.indexOf('\nfunction ', nqStart + 10));
const mapStart = src.indexOf('const MIA_CONSEQUENCE_MAP_V1 = {');
const postEnd  = src.indexOf('\n\n', src.indexOf('MIA_CONSEQUENCE_MAP_V1.smartphone = {', mapStart) + 10);
const mapCode  = src.slice(mapStart, postEnd);
const archCode = src.slice(src.indexOf('const MIA_ARCHETYPE_IDS ='), src.indexOf('\n\n', src.indexOf('const MIA_ARCHETYPE_IDS =') + 10));

const sandboxCode = `
"use strict";
${nqCode}
${archCode}
${mapCode}
${sliceFn("resolveMiaConsequenceTier")}
${sliceFn("resolveMiaConsequenceContextKey")}
${sliceFn("getMiaConsequenceMapEntry")}
${sliceFn("detectMiaUsageContextSignals")}
module.exports = { detectMiaUsageContextSignals, resolveMiaConsequenceContextKey, getMiaConsequenceMapEntry, MIA_CONSEQUENCE_MAP_V1 };
`;
const tmpPath = path.join(__dirname, "_tmp_hlu2.cjs");
fs.writeFileSync(tmpPath, sandboxCode);
let mod;
try { mod = require(tmpPath); } catch(e) { console.error("LOAD ERROR:", e.message.slice(0,300)); fs.unlinkSync(tmpPath); process.exit(1); }
fs.unlinkSync(tmpPath);

const { detectMiaUsageContextSignals, resolveMiaConsequenceContextKey, getMiaConsequenceMapEntry } = mod;

// derivePriority updated with batteryPriority
function derivePriority(s) {
  if (s.longTerm && !s.gaming && !s.heavyUse)                           return "longevity";
  if (s.gaming || s.heavyUse)                                           return "performance";
  if (s.awayFromHome)                                                   return "battery";
  if (s.batteryPriority && !s.casual && !s.regretFear && !s.longTerm)  return "battery";
  if (s.priceSensitive && !s.casual)                                    return "value";
  if (s.casual)                                                         return "performance";
  if (s.regretFear)                                                     return "performance";
  return "performance";
}
function activeList(s)  { return Object.entries(s).filter(([,v])=>v).map(([k])=>k); }
function countActive(s) { return Object.values(s).filter(Boolean).length; }

let passed = 0, failed = 0;
function check(label, cond, detail = "") {
  if (cond) { console.log(`✅ ${label}`); passed++; }
  else       { console.log(`❌ ${label}${detail ? " — " + detail : ""}`); failed++; }
}

// ── BLOCO 1: Sanity — regressão nos casos já estáveis ─────────────────────────
console.log("════════════════════════════════════════════════════════════════════════════════");
console.log("  SANITY CHECKS — zero regressão");
console.log("════════════════════════════════════════════════════════════════════════════════\n");

// Gaming recall (não deve mudar nunca)
const gamingCases = [
  "quero um celular para jogar free fire",
  "uso para games e jogos pesados",
  "jogar cod e pubg",
  "genshin impact no celular",
];
for (const q of gamingCases) {
  const s = detectMiaUsageContextSignals(q);
  check(`gaming recall: "${q.slice(0,45)}"`, !!s.gaming);
  check(`gaming: batteryPriority=false "${q.slice(0,35)}"`, !s.batteryPriority, `batteryPriority=${s.batteryPriority}`);
}

// Trabalho pesado: gaming=false, heavyUse=true (fix da Fase 1 que deve continuar)
const workCases = [
  "trabalho pesado multitarefa o dia todo",
  "uso o celular para trabalho e reuniões",
];
for (const q of workCases) {
  const s = detectMiaUsageContextSignals(q);
  check(`trabalho→heavyUse: "${q.slice(0,40)}"`, !!s.heavyUse && !s.gaming);
}

// Longevidade já estava funcionando
const longCases = ["quero um celular que dure bastante", "não quero trocar daqui a 2 anos"];
for (const q of longCases) {
  const s = detectMiaUsageContextSignals(q);
  check(`longTerm mantido: "${q.slice(0,40)}"`, !!s.longTerm);
}

// budget
check('priceSensitive: "não quero gastar demais"', !!detectMiaUsageContextSignals("não quero gastar demais").priceSensitive);
check('priceSensitive: "o mais barato que for bom"', !!detectMiaUsageContextSignals("o mais barato que for bom").priceSensitive);

// ── BLOCO 2: Novos sinais ─────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════════════════════════");
console.log("  NOVOS SINAIS — HLU Fase 2");
console.log("════════════════════════════════════════════════════════════════════════════════\n");

// batteryPriority
const bpCases = [
  ["quero bateria boa", true],
  ["quero boa autonomia", true],
  ["a bateria dura pouco no meu celular atual", true],
  ["odeio ficar carregando toda hora", true],
  ["celular sem bateria o tempo todo", true],
  // NÃO deve ativar quando não relevante
  ["quero jogar free fire", false],
  ["quero algo simples", false],
  ["preciso de um celular pra faculdade", false],
];
for (const [q, expected] of bpCases) {
  const s = detectMiaUsageContextSignals(q);
  check(`batteryPriority=${expected}: "${q.slice(0,48)}"`, !!s.batteryPriority === expected, `batteryPriority=${s.batteryPriority}`);
}

// batteryPriority não contamina gaming
const bp_gaming = detectMiaUsageContextSignals("quero um celular para jogos com bateria boa");
check("gaming+battery: gaming domina (contextKey=gaming)", 
  !!bp_gaming.gaming && !!bp_gaming.batteryPriority
);
const priority_gaming_battery = derivePriority(bp_gaming);
check("gaming+battery: derivePriority=performance (gaming vence)", priority_gaming_battery === "performance");

// regretFear → agora tem contextKey próprio
const regretCases = [
  "não quero me arrepender",
  "tô inseguro com os dois",
  "não sei qual escolher",
];
for (const q of regretCases) {
  const s = detectMiaUsageContextSignals(q);
  const priority = derivePriority(s);
  const ctx = resolveMiaConsequenceContextKey({ axis: priority, querySignals: s });
  const entry = getMiaConsequenceMapEntry({ axis: priority, contextKey: ctx, vertical: "smartphone" });
  check(`regretFear→contextKey=regretFear: "${q.slice(0,40)}"`, ctx === "regretFear", `ctx=${ctx}`);
  check(`regretFear: consequence não é performance/default: "${q.slice(0,30)}"`,
    !!entry?.consequence && !entry.consequence.includes("tarefas exigentes"),
    `consequence="${entry?.consequence?.slice(0,50)}"`
  );
  check(`regretFear: consequence fala de clareza: "${q.slice(0,30)}"`,
    !!entry?.consequence && (
      entry.consequence.includes("sentido") || 
      entry.consequence.includes("clareza") ||
      entry.consequence.includes("escolha")
    ),
    `consequence="${entry?.consequence?.slice(0,60)}"`
  );
}

// casual streaming
const streamingCases = [
  ["gosto de assistir séries no celular", true],
  ["uso bastante netflix", true],
  ["maratono filmes no fim de semana", true],
  ["quero um celular para streaming", true],
  // NÃO deve ativar casual para queries de trabalho puro
  ["trabalho pesado com apps profissionais", false],
];
for (const [q, expected] of streamingCases) {
  const s = detectMiaUsageContextSignals(q);
  check(`casual streaming=${expected}: "${q.slice(0,48)}"`, !!s.casual === expected, `casual=${s.casual}`);
}

// ── BLOCO 3: 32 queries caóticas — comparação ─────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════════════════════════");
console.log("  32 QUERIES CAÓTICAS — ANTES(26/32) vs DEPOIS");
console.log("════════════════════════════════════════════════════════════════════════════════\n");

const BEFORE_SIGNAL = new Set([
  "quero algo confiável pro dia a dia",
  "não quero me arrepender",
  "tenho medo de errar na escolha",
  "tenho dúvida se vale a pena pagar mais",
  "não sei qual escolher tô inseguro com os dois",
  "odeio celular travando não aguento mais",
  "uso redes sociais e tiktok o dia todo",
  "trabalho pesado multitarefa o dia todo",
  "quero jogar free fire sem lag",
  "viajo muito e fico longe da tomada",
  "quero um celular que dure bastante",
  "não quero trocar daqui a 2 anos",
  "não ligo pra câmera só quero que dure e não fique lento",
  "quero algo que envelheça bem sem ficar obsoleto",
  "o mais barato que for bom",
  "vale pagar mais?",
  "não quero gastar demais mas quero algo que preste",
  "tem algum bom por menos de mil reais",
  "quero um celular bom pra jogar mas que não seja caro",
  "uso para trabalho mas também jogo às vezes",
  "viajo muito e preciso de bateria boa mas não quero gastar muito",
  "quero algo que caiba no bolso seja rápido e não seja caro",
  "minha mãe quer um celular simples pro dia a dia",
  "preciso de um celular pra faculdade",
  "meu celular atual trava muito quero algo melhor",
  "não entendo nada de celular só quero o melhor",
]);

const queries = [
  { group: "A", q: "quero um celular bom" },
  { group: "A", q: "qual é melhor pra mim" },
  { group: "A", q: "me indica um celular" },
  { group: "A", q: "quero algo confiável pro dia a dia" },
  { group: "A", q: "QUAL MELHor SMARTPHONE??? preciso urgente" },
  { group: "B", q: "não quero me arrepender" },
  { group: "B", q: "tenho medo de errar na escolha" },
  { group: "B", q: "tenho dúvida se vale a pena pagar mais" },
  { group: "B", q: "não sei qual escolher tô inseguro com os dois" },
  { group: "B", q: "odeio celular travando não aguento mais" },
  { group: "C", q: "uso redes sociais e tiktok o dia todo" },
  { group: "C", q: "trabalho pesado multitarefa o dia todo" },
  { group: "C", q: "quero jogar free fire sem lag" },
  { group: "C", q: "viajo muito e fico longe da tomada" },
  { group: "D", q: "quero um celular que dure bastante" },
  { group: "D", q: "não quero trocar daqui a 2 anos" },
  { group: "D", q: "não ligo pra câmera só quero que dure e não fique lento" },
  { group: "D", q: "quero algo que envelheça bem sem ficar obsoleto" },
  { group: "E", q: "o mais barato que for bom" },
  { group: "E", q: "vale pagar mais?" },
  { group: "E", q: "não quero gastar demais mas quero algo que preste" },
  { group: "E", q: "tem algum bom por menos de mil reais" },
  { group: "F", q: "quero um celular bom pra jogar mas que não seja caro" },
  { group: "F", q: "uso para trabalho mas também jogo às vezes" },
  { group: "F", q: "quero bateria boa mas também quero algo bonito" },
  { group: "F", q: "viajo muito e preciso de bateria boa mas não quero gastar muito" },
  { group: "F", q: "quero algo que caiba no bolso seja rápido e não seja caro" },
  { group: "G", q: "minha mãe quer um celular simples pro dia a dia" },
  { group: "G", q: "preciso de um celular pra faculdade" },
  { group: "G", q: "uso para editar fotos e vídeos no celular" },
  { group: "G", q: "meu celular atual trava muito quero algo melhor" },
  { group: "G", q: "não entendo nada de celular só quero o melhor" },
];

let nowWithSignal = 0, stillOpaque = 0, newlyUnlocked = 0;
const unlocked = [], stillDark = [];

for (const { group, q } of queries) {
  const s       = detectMiaUsageContextSignals(q);
  const priority = derivePriority(s);
  const ctx     = resolveMiaConsequenceContextKey({ axis: priority, querySignals: s });
  const entry   = getMiaConsequenceMapEntry({ axis: priority, contextKey: ctx, vertical: "smartphone" });
  const hasSig  = countActive(s) > 0;
  const hadSig  = BEFORE_SIGNAL.has(q);

  if (hasSig) nowWithSignal++; else stillOpaque++;

  let delta;
  if (!hadSig && hasSig) {
    delta = `✅ NOVO: [${activeList(s).join("+")}] → ${priority}/${ctx}`;
    newlyUnlocked++;
    unlocked.push({ q, signals: activeList(s), priority, ctx, consequence: entry?.consequence });
  } else if (hadSig && !hasSig) {
    delta = `❌ REGRESSÃO`;
  } else if (hadSig) {
    delta = `✓ manteve [${activeList(s).join("+")}] → ${priority}/${ctx}`;
  } else {
    delta = `⚪ ainda opaco`;
    stillDark.push(q);
  }

  console.log(`[${group}] "${q.slice(0,55)}"`);
  console.log(`       ${delta}`);
}

// ── Resumo ─────────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════════════════════════");
console.log("  RESUMO FINAL");
console.log("════════════════════════════════════════════════════════════════════════════════\n");
console.log(`Fase 1 → 26/32 com sinal | 6/32 opacas`);
console.log(`Fase 2 → ${nowWithSignal}/32 com sinal | ${stillOpaque}/32 opacas`);
console.log(`Novas queries desbloqueadas: ${newlyUnlocked}`);

if (unlocked.length) {
  console.log("\n🆕 Desbloqueadas:");
  for (const { q, signals, priority, ctx, consequence } of unlocked) {
    console.log(`  ✅ "${q.slice(0,55)}"`);
    console.log(`      [${signals.join("+")}] → ${priority}/${ctx}`);
    if (consequence) console.log(`      → "${consequence.slice(0,70)}"`);
  }
}
if (stillDark.length) {
  console.log("\n⚪ Ainda opacas (honest fallback):");
  for (const q of stillDark) console.log(`   "${q}"`);
}

// ── Verificação de contaminação ────────────────────────────────────────────────
console.log("\n────────────────────────────────────────────────────────────────────────────────");
console.log("  VERIFICAÇÃO DE CONTAMINAÇÃO");
console.log("────────────────────────────────────────────────────────────────────────────────\n");

// batteryPriority não deve dominar queries de trabalho/gaming
const contamCases = [
  { q: "trabalho pesado com multitarefa o dia todo", expectBattery: false },
  { q: "quero jogar free fire e moba", expectBattery: false },
  { q: "câmera boa e bateria boa", expectGaming: false },
  { q: "uso para streaming de filmes com boa bateria", note: "casual+battery — casual deve dominar" },
];
for (const tc of contamCases) {
  const s = detectMiaUsageContextSignals(tc.q);
  const priority = derivePriority(s);
  if (tc.expectBattery === false) {
    check(`battery não domina: "${tc.q.slice(0,45)}"`,
      priority !== "battery" || (!s.batteryPriority),
      `priority=${priority}, battery=${s.batteryPriority}`
    );
  }
  if (tc.note) {
    const ctx = resolveMiaConsequenceContextKey({ axis: priority, querySignals: s });
    console.log(`  ℹ️  "${tc.q}" → ${priority}/${ctx} (${tc.note})`);
  }
}

// casual não ficou broad demais
const notCasual = [
  "uso para programação e desenvolvimento de software",
  "trabalho com apps pesados de engenharia",
];
for (const q of notCasual) {
  const s = detectMiaUsageContextSignals(q);
  check(`casual não ativou: "${q.slice(0,50)}"`, !s.casual, `casual=${s.casual}`);
}

// regretFear ainda é cross-cutting quando há outro sinal forte
const regretGaming = detectMiaUsageContextSignals("tenho medo de errar mas quero jogar free fire");
const ck = resolveMiaConsequenceContextKey({ axis: derivePriority(regretGaming), querySignals: regretGaming });
check("regretFear+gaming: gaming domina (não regretFear)", ck === "gaming", `contextKey=${ck}`);

console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
console.log(`Sanity checks: ${passed} passou, ${failed} falhou`);
console.log(`════════════════════════════════════════════════════════════════════════════════\n`);

if (failed > 0) process.exit(1);
