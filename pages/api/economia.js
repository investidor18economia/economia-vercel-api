import SerpApi from 'google-search-results-nodejs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST' });
  }

  const clientKey = req.headers['x-api-key'];
  if (process.env.API_SHARED_KEY && clientKey !== process.env.API_SHARED_KEY) {
    return res.status(403).json({ error: 'invalid_api_key' });
  }

  const body = req.body || {};
  const text = body.text || '';
  if (!text) {
    return res.status(400).json({ error: 'Missing parameter: text' });
  }

  const search = new SerpApi.GoogleSearch(process.env.SERPAPI_KEY);

  const params = {
    engine: 'google_shopping',
    q: text,
    gl: 'br',
    hl: 'pt'
  };

  const results = await new Promise((resolve) => {
    search.json(params, (data) => resolve(data));
  });

  const formatted = (results.shopping_results || []).map((item) => {
    const realLink =
      item.product_link ||
      item.serpapi_product_link ||
      item.link ||
      '';

    const redirectUrl =
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/redirect?u=${encodeURIComponent(realLink)}&p=${encodeURIComponent(item.title || '')}`;

    return {
      title: item.title || '',
      price: item.price || '',
      link: realLink,
      redirectUrl: redirectUrl,
      source: item.source || ''
    };
  });

  return res.status(200).json({
    source: 'live',
    query: text,
    results: formatted
  });
}
