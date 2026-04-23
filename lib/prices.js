import axios from "axios";

export async function fetchSerpPrices(query, limit = 8) {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;

  if (!SERPAPI_KEY) {
    console.error("❌ SERPAPI_KEY não definida");
    return [];
  }

  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google_shopping",
        q: query,
        gl: "br",
        hl: "pt",
        api_key: SERPAPI_KEY,
      },
      timeout: 10000,
    });

    const data = response.data;

    if (!data.shopping_results) return [];

    return data.shopping_results.slice(0, limit).map((p) => ({
      product_name: p.title || "",
      price: p.extracted_price || p.price || null,
      link: p.link || null,
      thumbnail: p.thumbnail || null,
      source: p.source || "",
    }));

  } catch (err) {
    console.error("❌ ERRO SERPAPI:", err?.message || err);
    return [];
  }
}
