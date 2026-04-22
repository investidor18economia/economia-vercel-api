// lib/openai.js

function buildOpenAIPayload(messages, opts = {}) {
  return {
    model: opts.model || process.env.MODEL_GPT4O_MINI || "gpt-4o-mini",
    messages,
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.max_tokens ?? 800,
  };
}

export async function callOpenAI(messages, opts = {}) {
  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  if (!Array.isArray(messages) || !messages.length) {
    throw new Error("callOpenAI requires a non-empty messages array");
  }

  const payload = buildOpenAIPayload(messages, opts);

  const controller = new AbortController();
  const timeoutMs = opts.timeout_ms ?? 30000;

  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`OpenAI error ${res.status} ${txt}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function getOpenAIText(response) {
  return (
    response?.choices?.[0]?.message?.content?.trim?.() ||
    ""
  );
}
