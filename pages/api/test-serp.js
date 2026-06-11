import { fetchSerpPrices } from "../../lib/prices";

export default async function handler(req, res) {
  try {
    const query = req.query.q || "iphone 14 pro";
    const prices = await fetchSerpPrices(query, 5);

    return res.status(200).json({
      ok: true,
      hasSerpKey: !!process.env.SERPAPI_KEY,
      count: prices.length,
      prices
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      hasSerpKey: !!process.env.SERPAPI_KEY,
      error: String(err)
    });
  }
}
