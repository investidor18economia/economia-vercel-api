import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

function buildSessionKey(req, userId = "guest", conversationId = "") {
  if (userId && userId !== "guest") {
    return `user:${userId}`;
  }

  if (conversationId && String(conversationId).trim().length > 8) {
    return `conversation:${String(conversationId).trim()}`;
  }

  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket?.remoteAddress ||
    "unknown-ip";

  const ua = req.headers["user-agent"] || "unknown-agent";

  const hash = crypto
    .createHash("sha256")
    .update(`${ip}:${ua}`)
    .digest("hex")
    .slice(0, 32);

  return `guest:${hash}`;
}

async function loadBackendSessionContext(sessionKey = "") {
  if (!sessionKey) return {};

  const { data, error } = await supabase
    .from("mia_sessions")
    .select("session_context")
    .eq("session_key", sessionKey)
    .maybeSingle();

  if (error) {
    console.error("Erro ao carregar mia_sessions:", error);
    return {};
  }

  return data?.session_context || {};
}

async function saveBackendSessionContext(sessionKey = "", userId = "guest", sessionContext = {}) {
  if (!sessionKey || !sessionContext || typeof sessionContext !== "object") return;

  const { error } = await supabase
    .from("mia_sessions")
    .upsert({
      session_key: sessionKey,
      user_id: userId,
      session_context: sessionContext,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error("Erro ao salvar mia_sessions:", error);
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientKey = req.headers["x-api-key"] || "";
  if (clientKey !== process.env.API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  try {
    const { text, user_id, image_base64, conversation_id } = req.body || {};

const hasText = text && String(text).trim().length > 0;
const hasImage = image_base64 && String(image_base64).length > 50;

if (!hasText && !hasImage) {
  return res.status(400).json({
    error: "Missing input",
    reply: "Me manda o que voc├¬ quer comprar ou uma imagem do produto.",
    prices: []
  });
}

    const userId = user_id || "guest";

    const sessionKey = buildSessionKey(req, userId, conversation_id);

const backendSessionContext = await loadBackendSessionContext(sessionKey);

const mergedSessionContext = {
  ...backendSessionContext,
  ...(req.body.session_context || {})
};

console.log("­ƒºá BACKEND SESSION MEMORY:", {
  sessionKey,
  userId,
  conversation_id,
  hasBackendMemory: Object.keys(backendSessionContext || {}).length > 0,
  hasFrontendMemory: Object.keys(req.body.session_context || {}).length > 0,
  mergedKeys: Object.keys(mergedSessionContext || {})
});

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("plan, monthly_messages")
      .eq("id", userId)
      .maybeSingle();

    if (userError) {
      console.error("Erro ao buscar user:", userError);
    }

    const isPlus = user?.plan === "plus";
    const limit = isPlus
      ? Number(process.env.PLUS_MONTHLY_MSGS || 300)
      : Number(process.env.FREE_MONTHLY_MSGS || 5);

    if ((user?.monthly_messages || 0) >= limit) {
      return res.status(403).json({
        reply: "Voc├¬ atingiu o limite mensal. Fa├ºa upgrade para Premium!",
        prices: []
      });
    }

    const protocol =
      req.headers["x-forwarded-proto"] ||
      (req.headers.host?.includes("localhost") ? "http" : "https");

    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const apiUrl = `${protocol}://${host}`;

    let data;

try {
  const response = await fetch(`${apiUrl}/api/chat-gpt4o`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.API_SHARED_KEY
    },
  body: JSON.stringify({
  text,
  image_base64: req.body.image_base64 || "",
  user_id: userId,
  conversation_id: conversation_id || sessionKey,
  messages: req.body.messages || [],
  session_context: mergedSessionContext
})
  });

 data = await response.json();

if (data?.session_context) {
  await saveBackendSessionContext(sessionKey, userId, data.session_context);
}

if (!response.ok) {
    console.error("Erro chat-gpt4o:", response.status, data);

    return res.status(200).json({
      reply: data?.reply || "Tive um problema ao processar, tenta de novo ­ƒÿè",
      prices: []
    });
  }

} catch (fetchError) {
  console.error("Erro no fetch chat-gpt4o:", fetchError);

  return res.status(200).json({
    reply: "ÔÜá´©Å N├úo consegui conectar agora, tenta novamente em instantes ­ƒÿè",
    prices: []
  });
}

    if (userId !== "guest") {
      const currentMessages = user?.monthly_messages || 0;

      const { error: upsertError } = await supabase
        .from("users")
        .upsert({
          id: userId,
          monthly_messages: currentMessages + 1,
          plan: user?.plan || "free"
        });

      if (upsertError) {
        console.error("Erro ao atualizar user:", upsertError);
      }
    }

        return res.status(200).json({
      reply: data.reply || "Sem resposta no momento.",
      prices: data.prices || [],
      session_context: data.session_context || mergedSessionContext || {}
    });

  } catch (err) {
    console.error("Erro /api/economia:", err);
    return res.status(500).json({
      error: "Erro interno",
      reply: "Desculpe, algo deu errado!",
      prices: []
    });
  }
}
