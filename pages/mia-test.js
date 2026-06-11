import { useState, useRef, useEffect } from "react";

const API_KEY = "minha_chave_181199";
const ENDPOINT = "/api/chat-gpt4o";

const SIGNAL_LABELS = {
  gaming: "🎮 gaming",
  heavyUse: "⚡ heavyUse",
  awayFromHome: "🚶 awayFromHome",
  casual: "☕ casual",
  longTerm: "📅 longTerm",
  regretFear: "😟 regretFear",
  priceSensitive: "💰 priceSensitive",
  batteryPriority: "🔋 batteryPriority",
};

const AXIS_COLORS = {
  performance: "#6366f1",
  battery: "#22c55e",
  value: "#f59e0b",
  camera: "#ec4899",
  longevity: "#14b8a6",
  screen: "#8b5cf6",
};

function SignalBadge({ label, active }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        marginRight: 4,
        marginBottom: 4,
        background: active ? "#1e3a5f" : "#1a1a2e",
        color: active ? "#60a5fa" : "#4b5563",
        border: `1px solid ${active ? "#3b82f6" : "#2d2d44"}`,
        opacity: active ? 1 : 0.45,
      }}
    >
      {label}
    </span>
  );
}

function AxisPill({ axis }) {
  const color = AXIS_COLORS[axis] || "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 700,
        background: color + "22",
        color: color,
        border: `1px solid ${color}55`,
        marginRight: 4,
      }}
    >
      {axis}
    </span>
  );
}

function DebugPanel({ debug }) {
  if (!debug) return null;

  const signals = debug.querySignals || {};
  const activeSignals = Object.entries(signals).filter(([, v]) => v === true);

  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: 10,
        padding: "16px 18px",
        fontSize: 13,
        lineHeight: 1.6,
      }}
    >
      <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 10, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
        MIA Cognitive Debug
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>WINNER / LOSER</div>
          <div style={{ color: "#f1f5f9", fontWeight: 600 }}>{debug.winner || "—"}</div>
          <div style={{ color: "#94a3b8", fontSize: 12 }}>vs {debug.loser || "—"}</div>
        </div>

        <div>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>PRIORITY AXIS</div>
          {debug.axis ? <AxisPill axis={debug.axis} /> : <span style={{ color: "#4b5563" }}>—</span>}
        </div>

        <div>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>CONTEXT KEY</div>
          <div style={{ color: "#a78bfa", fontFamily: "monospace" }}>{debug.contextKey || "—"}</div>
        </div>

        <div>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}>CONFIDENCE</div>
          <div style={{ color: debug.confidence === "high" ? "#22c55e" : debug.confidence === "medium" ? "#f59e0b" : "#ef4444" }}>
            {debug.confidence || "—"} {debug.dominance ? `· ${debug.dominance}` : ""}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>QUERY SIGNALS</div>
        <div>
          {Object.entries(SIGNAL_LABELS).map(([key, label]) => (
            <SignalBadge key={key} label={label} active={!!signals[key]} />
          ))}
        </div>
        {activeSignals.length === 0 && (
          <div style={{ color: "#4b5563", fontSize: 12, marginTop: 4 }}>nenhum sinal ativo — fallback genérico</div>
        )}
      </div>

      {debug.archetypeSignals?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>ARCHETYPES</div>
          <div>
            {debug.archetypeSignals.map((a) => (
              <span
                key={a}
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  background: "#1e1b4b",
                  color: "#a78bfa",
                  border: "1px solid #4c1d95",
                  marginRight: 4,
                  marginBottom: 4,
                  fontFamily: "monospace",
                }}
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {debug.tradeoff?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}>TRADEOFFS</div>
          <div>{debug.tradeoff.map((t) => <AxisPill key={t} axis={t} />)}</div>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: debug.consequenceActive ? "#22c55e" : "#ef4444",
          }}
        />
        <span style={{ color: "#64748b", fontSize: 11 }}>
          consequence reasoning {debug.consequenceActive ? "ATIVO" : "INATIVO"}
          {debug.consequenceVersion ? ` · v${debug.consequenceVersion}` : ""}
        </span>
      </div>
    </div>
  );
}

function Message({ role, content, debug, timestamp }) {
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div
      style={{
        marginBottom: 24,
        display: "flex",
        flexDirection: "column",
        alignItems: role === "user" ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          padding: "12px 16px",
          borderRadius: role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: role === "user" ? "#1d4ed8" : "#1e293b",
          color: "#f1f5f9",
          fontSize: 14,
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
        }}
      >
        {content}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
        <span style={{ color: "#4b5563", fontSize: 11 }}>
          {role === "user" ? "você" : "MIA"} · {timestamp}
        </span>
        {role === "mia" && debug && (
          <button
            onClick={() => setShowDebug(!showDebug)}
            style={{
              background: "none",
              border: "1px solid #334155",
              borderRadius: 4,
              color: "#64748b",
              fontSize: 11,
              padding: "1px 8px",
              cursor: "pointer",
            }}
          >
            {showDebug ? "▲ debug" : "▼ debug"}
          </button>
        )}
      </div>

      {showDebug && debug && (
        <div style={{ maxWidth: "80%", width: "100%", marginTop: 6 }}>
          <DebugPanel debug={debug} />
        </div>
      )}
    </div>
  );
}

export default function MiaTest() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionContext, setSessionContext] = useState({});
  const [error, setError] = useState(null);
  const [showHints, setShowHints] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(text) {
    if (!text.trim() || loading) return;

    const userMsg = {
      role: "user",
      content: text.trim(),
      timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setError(null);
    setShowHints(false);

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
        },
        body: JSON.stringify({
          text: text.trim(),
          user_id: "mia-test-local",
          conversation_id: "mia-test-session",
          session_context: sessionContext,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.reply || `HTTP ${res.status}`);
      }

      if (data.session_context) {
        setSessionContext(data.session_context);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "mia",
          content: data.reply || "(sem resposta)",
          debug: data.mia_debug || null,
          timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } catch (err) {
      setError(err.message || "Erro desconhecido");
      setMessages((prev) => [
        ...prev,
        {
          role: "mia",
          content: "⚠️ Erro na requisição. Veja o console para detalhes.",
          debug: null,
          timestamp: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function clearChat() {
    setMessages([]);
    setSessionContext({});
    setError(null);
    setShowHints(true);
  }

  const HINTS = [
    "Samsung Galaxy S25 vs Galaxy A73 5G — uso muito jogos",
    "iPhone 16 vs S25 — tenho medo de me arrepender",
    "S25 vs A73 — odeio celular travando",
    "iPhone vs S25 — quero bateria boa mas também quero algo bonito",
    "S25 vs A73 — pra minha mãe usar no dia a dia",
    "S25 vs A73 — preciso de algo que dure bastante, não quero trocar cedo",
    "iPhone vs S25 — não entendo nada de celular, qual escolho?",
    "S25 vs A73 — trabalho pesado, muita multitarefa",
    "iPhone vs S25 — quero o melhor custo-benefício, grana apertada",
    "S25 vs A73 — fora de casa o dia todo, longe de tomada",
    "quero um celular bom",
    "me indica um celular",
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0e1a",
        color: "#f1f5f9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 24px",
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#0d1117",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            M
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>MIA · Teste Local</div>
            <div style={{ color: "#64748b", fontSize: 11 }}>
              HLU Fase 1+2 · pipeline completo · debug ativo
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 6px #22c55e",
            }}
          />
          <span style={{ color: "#64748b", fontSize: 12 }}>localhost:3000</span>
          <button
            onClick={clearChat}
            style={{
              background: "none",
              border: "1px solid #334155",
              borderRadius: 6,
              color: "#94a3b8",
              fontSize: 12,
              padding: "4px 12px",
              cursor: "pointer",
              marginLeft: 8,
            }}
          >
            limpar
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "24px",
          maxWidth: 860,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        {messages.length === 0 && showHints && (
          <div>
            <div
              style={{
                textAlign: "center",
                marginBottom: 32,
                paddingTop: 40,
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 12 }}>🧠</div>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                MIA — Teste Humano Real
              </div>
              <div style={{ color: "#64748b", fontSize: 14, maxWidth: 460, margin: "0 auto" }}>
                Teste queries humanas reais, caóticas e variadas. Clique em "▼ debug" 
                em qualquer resposta para ver os sinais cognitivos da MIA.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                maxWidth: 720,
                margin: "0 auto",
              }}
            >
              {HINTS.map((hint, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(hint)}
                  style={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    color: "#94a3b8",
                    fontSize: 13,
                    padding: "10px 14px",
                    cursor: "pointer",
                    textAlign: "left",
                    lineHeight: 1.4,
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.target.style.borderColor = "#3b82f6")}
                  onMouseLeave={(e) => (e.target.style.borderColor = "#1e293b")}
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} {...msg} />
        ))}

        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 13 }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#3b82f6",
                animation: "pulse 1s infinite",
              }}
            />
            MIA está processando…
          </div>
        )}

        {error && (
          <div
            style={{
              background: "#1f0a0a",
              border: "1px solid #7f1d1d",
              borderRadius: 8,
              padding: "10px 14px",
              color: "#fca5a5",
              fontSize: 13,
              marginTop: 8,
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          borderTop: "1px solid #1e293b",
          padding: "16px 24px",
          background: "#0d1117",
          position: "sticky",
          bottom: 0,
        }}
      >
        <div
          style={{
            maxWidth: 860,
            margin: "0 auto",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder='Ex: "Samsung S25 vs A73 — odeio celular travando" · Enter para enviar'
            rows={2}
            style={{
              flex: 1,
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: 10,
              color: "#f1f5f9",
              fontSize: 14,
              padding: "10px 14px",
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
            onBlur={(e) => (e.target.style.borderColor = "#334155")}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? "#1e293b" : "#1d4ed8",
              border: "none",
              borderRadius: 10,
              color: loading || !input.trim() ? "#4b5563" : "#fff",
              fontSize: 14,
              fontWeight: 600,
              padding: "10px 20px",
              cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              height: 52,
              whiteSpace: "nowrap",
            }}
          >
            {loading ? "…" : "Enviar"}
          </button>
        </div>
        <div style={{ maxWidth: 860, margin: "6px auto 0", color: "#334155", fontSize: 11 }}>
          Enter = enviar · Shift+Enter = nova linha · Clique "▼ debug" na resposta para ver querySignals, archetypeSignals, axis, contextKey
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
      `}</style>
    </div>
  );
}
