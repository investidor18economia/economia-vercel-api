// lib/openai.js
export async function callOpenAI(messages, opts = {}) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY not set");

  const payload = {
    model: opts.model || process.env.MODEL_GPT4O_MINI || "gpt-4o-mini",
    messages,
    temperature: opts.temperature ?? 0.15,
    max_tokens: opts.max_tokens ?? 800,
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status} ${txt}`);
  }
  return res.json();
}
