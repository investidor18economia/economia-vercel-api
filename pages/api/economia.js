import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const API_SHARED_KEY = process.env.API_SHARED_KEY || '';
const CACHE_TTL_MINUTES = parseInt(process.env.CACHE_TTL_MINUTES || '10', 10);
const BASE_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : (process.env.NEXT_PUBLIC_BASE_URL || 'https://economia-ai.vercel.app');

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

function buildAffiliate(originalUrl) {
  if (!originalUrl) return '';
  try {
    const url = new URL(originalUrl);
    const host = url.hostname.replace('www.', '').toLowerCase();
    const AFF = {
      'americanas.com': 'https://www.americanas.com.br/aff?affid=SEU_AFF_ID&url=',
      'magazineluiza.com.br': 'https://www.magazineluiza.com.br/aff?affid=SEU_AFF_ID&url=',
      'mercadolivre.com.br': 'https://www.mercadolivre.com/aff?affid=SEU_AFF_ID&url='
    };
    for (const domain in AFF) {
      if (host.includes(domain)) {
        return AFF[domain] + encodeURIComponent(originalUrl);
      }
    }
    return originalUrl;
  } catch (e) {
    return originalUrl;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST' });
    const key = (req.headers['x-api-key'] || '').toString();
    if (process.env.API_SHARED_KEY && key !== process.env.API_SHARED_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const body = req.body || {};
    const inputText = (body.text || '').trim();
    const userId = body.user_id || null;
    if (!inputText) return res.status(400).json({ error: 'Missing parameter: text' });
    const cutoff = new Date(Date.now() - CACHE_TTL_MINUTES * 60000).toISOString();
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
    let results;
    try {
      results = await fetchFromSerpApi(inputText);
    } catch (err) {
      console.error('SerpApi fetch error', err.message);
      return res.status(502).json({ error: 'Price service unavailable' });
    }
    try {
      const payload = {
        query: inputText,
        metadata: results,
        last_checked: new Date().toISOString()
      };
      await supabase.from('cache_results').upsert(payload, { onConflict: 'query' });
    } catch (err) {
      console.warn('Supabase write warning', err.message);
    }
    const enriched = results.map(r => {
      const affiliate = buildAffiliate(r.link);
      const redirectUrl = `${BASE_URL}/api/redirect?u=${encodeURIComponent(affiliate)}&p=${encodeURIComponent(r.title || r.link || '')}`;
      return { ...r, affiliateLink: affiliate, redirectUrl };
    });
    return res.status(200).json({ source: 'live', query: inputText, results: enriched });
  } catch (err) {
    console.error('API error', err);
    return res.status(500).json({ error: 'internal_error', details: String(err.message || err) });
  }
}
