export default async function handler(req, res) {
  try {
    const query = req.query.q || "iphone 14 pro mais barato";

    const response = await fetch("https://economia-ai.vercel.app/api/economia", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_SHARED_KEY
      },
      body: JSON.stringify({
        text: query,
        user_id: "guest-test"
      })
    });

    const data = await response.json();

    return res.status(200).json({
      ok: response.ok,
      status: response.status,
      data
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: String(err)
    });
  }
}
