-- ====================================================
-- MIA DATA LAYER — FK REPAIR
-- produto: product_specs.detail_id -> phone_specs.id
-- ====================================================
-- Executar no Supabase Dashboard > SQL Editor
-- Zero mudança no pipeline cognitivo.
-- Zero hardcode de ranking.
-- Apenas correção de vínculos de dados.
-- ====================================================
-- Auditado em: 2026-05-28
-- Total de FKs corrigidos: 15
-- Causa raiz: rotação sistemática de detail_id na importação
-- ====================================================

-- BEFORE: verificar estado atual (rode isso primeiro, compare com "after")
SELECT
  ps.official_name        AS product,
  ps.detail_id            AS current_detail_id,
  ph.official_name        AS currently_points_to
FROM product_specs ps
LEFT JOIN phone_specs ph ON ph.id = ps.detail_id
WHERE ps.category = 'phone'
ORDER BY ps.official_name;

-- ====================================================
-- FK REPAIRS (15 updates)
-- ====================================================

-- Bloco 1 — Redmi / Realme / iPhone (rotação simples)
UPDATE product_specs SET detail_id = 8  WHERE official_name = 'Redmi Note 13 Pro 5G'     AND category = 'phone';
UPDATE product_specs SET detail_id = 9  WHERE official_name = 'Realme Note 70'            AND category = 'phone';
UPDATE product_specs SET detail_id = 10 WHERE official_name = 'iPhone 11'                 AND category = 'phone';
UPDATE product_specs SET detail_id = 11 WHERE official_name = 'iPhone 13'                 AND category = 'phone';

-- Bloco 2 — Linha S25 (FE, base, +, Ultra)
UPDATE product_specs SET detail_id = 12 WHERE official_name = 'Samsung Galaxy S25'        AND category = 'phone';
UPDATE product_specs SET detail_id = 13 WHERE official_name = 'Samsung Galaxy S25+'       AND category = 'phone';
UPDATE product_specs SET detail_id = 15 WHERE official_name = 'Samsung Galaxy S25 Ultra'  AND category = 'phone';
UPDATE product_specs SET detail_id = 16 WHERE official_name = 'Samsung Galaxy S25 FE'     AND category = 'phone';

-- Bloco 3 — Linha S24 (base, +, FE, Ultra)
UPDATE product_specs SET detail_id = 17 WHERE official_name = 'Samsung Galaxy S24'        AND category = 'phone';
UPDATE product_specs SET detail_id = 18 WHERE official_name = 'Samsung Galaxy S24+'       AND category = 'phone';
UPDATE product_specs SET detail_id = 19 WHERE official_name = 'Samsung Galaxy S24 Ultra'  AND category = 'phone';
UPDATE product_specs SET detail_id = 20 WHERE official_name = 'Samsung Galaxy S24 FE'     AND category = 'phone';

-- Bloco 4 — Linha S23 (base, +, Ultra)
-- Nota: S23 Ultra (id 14) estava OK como alvo, mas S23 base apontava para S24 Ultra
UPDATE product_specs SET detail_id = 21 WHERE official_name = 'Samsung Galaxy S23'        AND category = 'phone';
UPDATE product_specs SET detail_id = 7  WHERE official_name = 'Samsung Galaxy S23+'       AND category = 'phone';
-- S23 Ultra estava apontando para S23 (id 21) — corrigir para id 14
UPDATE product_specs SET detail_id = 14 WHERE official_name = 'Samsung Galaxy S23 Ultra'  AND category = 'phone';

-- ====================================================
-- AFTER: verificar estado corrigido
-- ====================================================
SELECT
  ps.official_name        AS product,
  ps.detail_id            AS detail_id,
  ph.official_name        AS points_to,
  CASE
    WHEN ps.official_name = ph.official_name
      OR replace(lower(ps.official_name), 'samsung ', '') = replace(lower(ph.official_name), 'samsung ', '')
    THEN 'OK'
    ELSE 'MISMATCH'
  END AS fk_status
FROM product_specs ps
LEFT JOIN phone_specs ph ON ph.id = ps.detail_id
WHERE ps.category = 'phone'
ORDER BY fk_status DESC, ps.official_name;

-- ====================================================
-- EXPECTED: all rows should show fk_status = 'OK'
-- If any MISMATCH remains: check that product
-- against the phone_specs id list manually.
-- ====================================================
