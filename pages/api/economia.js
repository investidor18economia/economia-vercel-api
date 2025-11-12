export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // coloque abaixo o resto do seu código original
}

// pages/api/economia.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const API_SHARED_KEY = process.env.API_SHARED_KEY || '';
const CACHE_TTL_MINUTES = parseInt(process.env.CACHE_TTL_MINUTES || '10', 10);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function fetchFromSerpApi(query) {
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: query,
    gl: 'br',
    hl: 'pt',
    api_key: SERPAPI_KEY,
  });
  const url = `https://serpapi.com/search.json?${params.toString()}`;
  const r = await fetch(url);
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error('SerpApi error: ' + r.status + ' - ' + txt);
  }
  const json = await r.json().catch(() => ({}));
  const items = json.shopping_results || json.organic_results || [];
  return items.slice(0, 8).map(it => ({
    title: it.title || it.product_title || it.name || '',
    price: it.price || it.price_string || it.extracted_price || '',
    link: it.link || it.source || it.url || '',
    source: it.source || it.store || ''
  }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });

    const key = (req.headers['x-api-key'] || '').toString();
    if (!API_SHARED_KEY || key !== API_SHARED_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body || {};
    const inputText = (body.text || '').trim();
    const userId = body.user_id || null;

    if (!inputText) return res.status(400).json({ error: 'Missing text' });

    const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60000).toISOString();

    // 1) Tentar ler cache
    const { data: cached, error: cacheErr } = await supabase
      .from('cache_results')
      .select('id, query, metadata, last_checked')
      .eq('query', inputText)
      .gte('last_checked', cutoff)
      .limit(1)
      .maybeSingle();

    if (cacheErr) console.warn('Supabase cache read err', cacheErr);

    if (cached && cached.last_checked) {
      return res.status(200).json({ source: 'cache', query: inputText, results: cached.metadata || [], cached_at: cached.last_checked });
    }

    // 2) Buscar na SerpApi
    let results;
    try {
      results = await fetchFromSerpApi(inputText);
    } catch (err) {
      console.error('SerpApi fetch error', err.message);
      return res.status(502).json({ error: 'Price service unavailable' });
    }

    // 3) Salvar/atualizar cache (upsert na tabela cache_results)
    try {
      const payload = {
        query: inputText,
        metadata: results,
        last_checked: new Date().toISOString()
      };

      await supabase
        .from('cache_results')
        .upsert(payload, { onConflict: 'query' });
    } catch (err) {
      console.warn('Supabase write warning', err.message);
    }

    // 4) Retornar resultado
    return res.status(200).json({ source: 'live', query: inputText, results });

  } catch (err) {
    console.error('API error', err);
    return res.status(500).json({ error: 'internal_error', details: String(err.message || err) });
  }
}

