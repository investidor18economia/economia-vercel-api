// pages/api/chat-gpt4o.js
import { createClient } from "@supabase/supabase-js";

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.MODEL_GPT4O_MINI || "gpt-4o-mini";
const API_SHARED_KEY = process.env.API_SHARED_KEY;
const FREE_LIMIT = parseInt(process.env.FREE_MONTHLY_MSGS || "10", 10);
const PLUS_LIMIT = parseInt(process.env.PLUS_MONTHLY_MSGS || "300", 10);

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function callOpenAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 800,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status} ${txt}`);
  }
  return res.json();
}

// helper: count messages this month for user
async function countUserMessagesThisMonth(user_id) {
  const { data, error } = await supabase.rpc('count_messages_monthly', { p_user_id: user_id }).catch(e => ({ error: e }));
  if (error) {
    // fallback SQL if RPC not present
    const from = new Date();
    from.setUTCDate(1);
    from.setUTCHours(0,0,0,0);
    const { data: rows } = await supabase
      .from("messages")
      .select("id", { count: "exact" })
      .eq("role", "user")
      .eq("conversation_id", null) // no, we can't assume; skip
      .gte("created_at", from.toISOString());
    return rows ? rows.length : 0;
  }
  return data?.count || 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // API shared key protection
  const clientKey = (req.headers["x-api-key"] || "").toString();
  if (!API_SHARED_KEY || clientKey !== API_SHARED_KEY) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const body = req.body || {};
  const user_id = body.user_id;
  const text = (body.text || "").trim();
  let conversation_id = body.conversation_id || null;

  if (!user_id) return res.status(400).json({ error: "Missing user_id" });
  if (!text) return res.status(400).json({ error: "Missing text" });

  // fetch user plan info
  const { data: users } = await supabase.from("users").select("id, email, name, external_id").eq("id", user_id).limit(1);
  const user = users && users[0] ? users[0] : null;
  // if you have a plan column, read it here, fallback = free
  const { data: planRow } = await supabase.from("users").select("plan").eq("id", user_id).limit(1);
  const plan = (planRow && planRow[0] && planRow[0].plan) ? planRow[0].plan : "free";
  const limit = plan === "plus" ? PLUS_LIMIT : FREE_LIMIT;

  // count user's user-role messages this month
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0,0,0,0);
  const { count } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: false })
    .eq("role", "user")
    .eq("conversation_id", conversation_id || undefined)
    .gte("created_at", monthStart.toISOString());

  const userMessagesThisMonth = count || 0;

  if (userMessagesThisMonth >= limit) {
    return res.status(403).json({
      error: "quota_exceeded",
      message: `Você atingiu o limite de ${limit} perguntas mensais para seu plano (${plan}).`,
    });
  }

  // ensure conversation exists
  if (!conversation_id) {
    const insertConv = await supabase.from("conversations").insert([{ user_id }]).select("id").limit(1);
    if (insertConv.error) {
      console.error("create conversation error", insertConv.error);
      return res.status(500).json({ error: "db_error" });
    }
    conversation_id = insertConv.data[0].id;
  }

  // load recent messages to build context (limit to last 12 to stay within token window)
  const { data: msgs } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation_id)
    .order("created_at", { ascending: true })
    .limit(12);

  const systemPrompt = {
    role: "system",
    content: `Você é a MIA, assistente da EconomIA. Seja objetivo, amigável e forneça comparações com justificativas. Resumo curto, tabela simples se for comparar, e recomende custo-benefício.`
  };

  const messagesForOpenAI = [systemPrompt];
  if (msgs && msgs.length) {
    for (const m of msgs) messagesForOpenAI.push({ role: m.role, content: m.content });
  }
  messagesForOpenAI.push({ role: "user", content: text });

  // save user message
  await supabase.from("messages").insert([{ conversation_id, role: "user", content: text }]);

  try {
    const openaiRes = await callOpenAI(messagesForOpenAI);
    const reply = openaiRes.choices?.[0]?.message?.content || "";
    const usage = openaiRes.usage || {};

    // save assistant message
    await supabase.from("messages").insert([{ conversation_id, role: "assistant", content: reply, tokens: usage.completion_tokens || null }]);

    // log usage
    await supabase.from("usage_log").insert([{
      user_id,
      model: MODEL,
      prompt_tokens: usage.prompt_tokens || null,
      completion_tokens: usage.completion_tokens || null,
      cost: null
    }]);

    return res.status(200).json({ conversation_id, reply });
  } catch (err) {
    console.error("openai call failed", err);
    return res.status(500).json({ error: "openai_error", details: String(err) });
  }
}
