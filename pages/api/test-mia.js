export default async function handler(req, res) {
  try {
    const query = req.query.q || "iphone 14 pro mais barato";

    const apiUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://economia-ai.vercel.app";

    const response = await fetch(`${apiUrl}/api/chat-gpt4o`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.API_SHARED_KEY
      },
      body: JSON.stringify({
        text: query,
        user_id: "guest-test",
        conversation_id: null
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
