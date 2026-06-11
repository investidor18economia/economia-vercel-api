/**
 * MIA DATA LAYER — INTEGRITY AUDIT
 * ====================================================
 * Valida: product_specs.detail_id → phone_specs.id
 *
 * USO:
 *   node scripts/audit-data-layer.js            # relatório completo
 *   node scripts/audit-data-layer.js --strict   # retorna exit code 1 se houver MISMATCH
 *   node scripts/audit-data-layer.js --fix-hint # mostra SQL hint para cada erro
 *
 * INTEGRAÇÃO CI/PRE-DEPLOY:
 *   Adicione ao package.json scripts:
 *   "precheck": "node scripts/audit-data-layer.js --strict"
 *
 * Zero mudança no pipeline cognitivo.
 * Zero hardcode de produto/ranking.
 * Apenas validação de integridade relacional.
 * ====================================================
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const https = require("https");

// ====================================================
// ENV — lê .env.local se não estiver no environment
// ====================================================
function loadEnv() {
  const fs = require("fs");
  const path = require("path");
  const { fileURLToPath } = require("url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.join(__dirname, "..", ".env.local");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) process.env[match[1].trim()] = match[2].trim();
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error("❌ SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausentes.");
    process.exit(1);
  }

  return { url, key };
}

// ====================================================
// FETCH helper
// ====================================================
async function supaFetch(url, key, path) {
  return new Promise((resolve, reject) => {
    const fullUrl = new URL(path, url);
    const options = {
      hostname: fullUrl.hostname,
      path: fullUrl.pathname + fullUrl.search,
      method: "GET",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json"
      }
    };
    let body = "";
    const req = https.request(options, (res) => {
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// ====================================================
// NORMALIZE — strip brand prefix for fuzzy match
// ====================================================
function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/^samsung\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return normName(a) === normName(b);
}

// ====================================================
// AUDIT
// ====================================================
async function runAudit() {
  const { url, key } = loadEnv();
  const strict = process.argv.includes("--strict");
  const fixHint = process.argv.includes("--fix-hint");

  console.log("🔍 MIA DATA LAYER AUDIT — Iniciando...\n");

  // 1. Fetch product_specs (phone category only)
  const psRes = await supaFetch(url, key,
    "/rest/v1/product_specs?select=official_name,detail_id,brand,is_active&category=eq.phone&order=official_name.asc"
  );
  if (psRes.status !== 200 || !Array.isArray(psRes.data)) {
    console.error("❌ Erro ao buscar product_specs:", psRes.status, psRes.data);
    process.exit(1);
  }
  const productSpecs = psRes.data;

  // 2. Fetch phone_specs
  const phRes = await supaFetch(url, key,
    "/rest/v1/phone_specs?select=id,official_name,release_year,status,last_verified_at,performance_score,battery_score,longevity_score,value_score&order=id.asc"
  );
  if (phRes.status !== 200 || !Array.isArray(phRes.data)) {
    console.error("❌ Erro ao buscar phone_specs:", phRes.status, phRes.data);
    process.exit(1);
  }
  const phoneSpecs = phRes.data;
  const phoneById = new Map(phoneSpecs.map((r) => [r.id, r]));
  const phoneByName = new Map(phoneSpecs.map((r) => [r.official_name, r]));

  // ====================================================
  // CHECK 1 — FK integrity (detail_id points to correct phone_specs)
  // ====================================================
  const broken = [];
  const ok = [];
  const orphan = []; // product with no matching phone_specs at all

  for (const ps of productSpecs) {
    const linked = phoneById.get(ps.detail_id);
    const correct = phoneByName.get(ps.official_name)
      || phoneSpecs.find((ph) => namesMatch(ph.official_name, ps.official_name));

    if (!correct) {
      orphan.push({ product: ps.official_name, detail_id: ps.detail_id });
      continue;
    }

    if (namesMatch(ps.official_name, linked?.official_name)) {
      ok.push(ps.official_name);
    } else {
      broken.push({
        product: ps.official_name,
        current_detail_id: ps.detail_id,
        current_points_to: linked?.official_name || "MISSING",
        correct_detail_id: correct.id,
        correct_points_to: correct.official_name,
        sql_fix: `UPDATE product_specs SET detail_id = ${correct.id} WHERE official_name = '${ps.official_name}' AND category = 'phone';`
      });
    }
  }

  // ====================================================
  // CHECK 2 — Score outlier detection
  // ====================================================
  const scoreWarnings = [];
  const RULES = {
    battery_score: {
      // mAh ≥ 6000 but battery_score < 70 = suspicious (may be placeholder)
      check: (row) => row.battery_mah >= 6000 && row.battery_score < 70,
      label: "6000+ mAh mas battery_score < 70 (possível placeholder)"
    },
    value_score_high: {
      // value_score > 94 is extremely rare; likely data error
      check: (row) => row.value_score > 94,
      label: "value_score > 94 (extremo — revisar)"
    },
    longevity_old: {
      // release_year <= 2021 with longevity_score >= 85 is suspicious
      check: (row) => row.release_year <= 2021 && row.longevity_score >= 85,
      label: "modelo pré-2022 com longevity_score ≥ 85 (revisar suporte)"
    },
    perf_battery_gap: {
      // performance >> battery by ≥ 20 but battery_score >= 90
      check: (row) => row.performance_score - row.battery_score >= 20 && row.battery_score >= 90,
      label: "performance >> battery mas battery_score ≥ 90 (verificar eficiência)"
    },
    null_scores: {
      check: (row) => [row.performance_score, row.battery_score, row.longevity_score, row.value_score].some((v) => v == null),
      label: "scores incompletos (null)"
    }
  };

  for (const ph of phoneSpecs) {
    for (const [ruleKey, rule] of Object.entries(RULES)) {
      if (rule.check(ph)) {
        scoreWarnings.push({
          model: ph.official_name,
          rule: ruleKey,
          label: rule.label,
          scores: {
            perf: ph.performance_score,
            bat: ph.battery_score,
            long: ph.longevity_score,
            val: ph.value_score,
            mah: ph.battery_mah
          },
          release_year: ph.release_year,
          last_verified: ph.last_verified_at
        });
      }
    }
  }

  // ====================================================
  // CHECK 3 — Status / freshness
  // ====================================================
  const staleWarnings = [];
  const now = new Date();
  for (const ph of phoneSpecs) {
    const lastVerified = ph.last_verified_at ? new Date(ph.last_verified_at) : null;
    const daysSince = lastVerified ? Math.floor((now - lastVerified) / 86400000) : Infinity;
    if (ph.status !== "approved") {
      staleWarnings.push({ model: ph.official_name, status: ph.status, issue: "status != approved" });
    }
    if (daysSince > 180) {
      staleWarnings.push({ model: ph.official_name, days_since_verified: daysSince, issue: "não verificado há >180 dias" });
    }
  }

  // ====================================================
  // REPORT
  // ====================================================
  const hasMismatch = broken.length > 0 || orphan.length > 0;

  console.log(`CHECK 1 — FK integrity`);
  console.log(`  ✅ OK:        ${ok.length} / ${productSpecs.length}`);
  console.log(`  ❌ BROKEN:    ${broken.length}`);
  console.log(`  ⚠️  ORPHAN:    ${orphan.length} (sem match em phone_specs)`);

  if (broken.length > 0) {
    console.log("\n  BROKEN FKs:");
    for (const b of broken) {
      console.log(`  ❌ ${b.product}`);
      console.log(`     detail_id ${b.current_detail_id} → "${b.current_points_to}"`);
      console.log(`     correto:  ${b.correct_detail_id} → "${b.correct_points_to}"`);
      if (fixHint) console.log(`     SQL: ${b.sql_fix}`);
    }
  }

  if (orphan.length > 0) {
    console.log("\n  ORPHAN (sem phone_specs correspondente):");
    orphan.forEach((o) => console.log(`  ⚠️  ${o.product} (detail_id: ${o.detail_id})`));
  }

  console.log(`\nCHECK 2 — Score outliers`);
  if (scoreWarnings.length === 0) {
    console.log("  ✅ Nenhuma anomalia detectada");
  } else {
    console.log(`  ⚠️  ${scoreWarnings.length} aviso(s):`);
    for (const w of scoreWarnings) {
      console.log(`  ⚠️  ${w.model} [${w.rule}] — ${w.label}`);
      console.log(`     scores: perf=${w.scores.perf} bat=${w.scores.bat} long=${w.scores.long} val=${w.scores.val} mah=${w.scores.mah}`);
      if (w.last_verified) console.log(`     last_verified: ${w.last_verified}`);
    }
  }

  console.log(`\nCHECK 3 — Status / freshness`);
  if (staleWarnings.length === 0) {
    console.log("  ✅ Todos aprovados e verificados recentemente");
  } else {
    console.log(`  ⚠️  ${staleWarnings.length} aviso(s):`);
    for (const w of staleWarnings) {
      console.log(`  ⚠️  ${w.model} — ${w.issue}`);
    }
  }

  // ====================================================
  // SUMMARY
  // ====================================================
  console.log("\n" + "=".repeat(52));
  if (!hasMismatch && scoreWarnings.length === 0) {
    console.log("✅ DATA LAYER ÍNTEGRO — nenhum problema crítico.");
  } else if (hasMismatch) {
    console.log(`❌ DATA LAYER COM ERROS CRÍTICOS — ${broken.length} FK(s) quebrado(s).`);
    if (fixHint) console.log("   Rode com --fix-hint para ver o SQL de correção.");
    else console.log("   Rode com --fix-hint para ver o SQL de correção.");
    console.log("   Aplique scripts/fk-repair.sql no Supabase Dashboard > SQL Editor.");
  } else {
    console.log(`⚠️  DATA LAYER COM AVISOS — ${scoreWarnings.length} score(s) para revisão humana.`);
  }
  console.log("=".repeat(52) + "\n");

  if (strict && hasMismatch) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error("❌ AUDIT CRASH:", err.message || err);
  process.exit(1);
});
