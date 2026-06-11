import { useEffect, useState } from "react";
import MIAWordmark from "./MIAWordmark";

const STORAGE_KEY = "mia_preferences";

const RESPONSE_OPTIONS = [
  {
    id: "direct",
    title: "Respostas mais diretas",
    text: "A MIΛ vai direto ao ponto.",
  },
  {
    id: "detailed",
    title: "Explicações mais completas",
    text: "Mais contexto antes da recomendação.",
  },
  {
    id: "prosCons",
    title: "Mostrar prós e contras",
    text: "Ajuda você a entender os pontos fortes e fracos de cada opção.",
  },
  {
    id: "simple",
    title: "Evitar linguagem técnica",
    text: "Explicações mais simples e fáceis de entender.",
  },
];

const PRIORITY_OPTIONS = [
  { id: "cost-benefit", icon: "💰", label: "Custo-benefício" },
  { id: "durability", icon: "🔋", label: "Durabilidade" },
  { id: "lowest-price", icon: "🏷️", label: "Menor preço" },
  { id: "trusted-brand", icon: "🛡️", label: "Marca confiável" },
  { id: "avoid-regret", icon: "😌", label: "Evitar arrependimento" },
];

const NOTIFICATION_OPTIONS = [
  {
    id: "priceAlerts",
    title: "Alertas de preço",
    text: "A MIΛ avisa quando uma oportunidade aparece.",
  },
  {
    id: "email",
    title: "Notificações por email",
    text: "Receba atualizações importantes no seu email.",
  },
  {
    id: "miaUpdates",
    title: "Atualizações da MIΛ",
    text: "Novos recursos, melhorias e novidades.",
  },
];

const APPEARANCE_OPTIONS = [
  { id: "dark", label: "Escuro", status: "active" },
  { id: "auto", label: "Automático", status: "soon" },
  { id: "light", label: "Claro", status: "soon" },
];

const DEFAULT_PREFERENCES = {
  responseStyle: {
    direct: false,
    detailed: false,
    prosCons: false,
    simple: false,
  },
  priorities: [],
  notifications: {
    priceAlerts: true,
    email: true,
    miaUpdates: true,
  },
};

function loadPreferences() {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      responseStyle: { ...DEFAULT_PREFERENCES.responseStyle, ...(parsed.responseStyle || {}) },
      priorities: Array.isArray(parsed.priorities) ? parsed.priorities : [],
      notifications: { ...DEFAULT_PREFERENCES.notifications, ...(parsed.notifications || {}) },
    };
  } catch (_) {
    return DEFAULT_PREFERENCES;
  }
}

function persistPreferences(preferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (_) {
    /* noop */
  }
}

function PreferenceToggle({ title, text, checked, onChange, disabled = false }) {
  return (
    <label className={`mia-settings-toggle-card${checked ? " mia-settings-toggle-card--active" : ""}${disabled ? " mia-settings-toggle-card--disabled" : ""}`}>
      <span className="mia-settings-toggle-copy">
        <span className="mia-settings-toggle-title">{title}</span>
        <span className="mia-settings-toggle-text">{text}</span>
      </span>
      <span className="mia-settings-toggle-switch" aria-hidden="true">
        <input
          type="checkbox"
          className="mia-settings-toggle-input"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="mia-settings-toggle-track" />
      </span>
    </label>
  );
}

export default function MIASettingsPanel({ onClose, onClearCache, cacheBusy = false }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  useEffect(() => {
    setPreferences(loadPreferences());
  }, []);

  function updatePreferences(next) {
    setPreferences(next);
    persistPreferences(next);
  }

  function toggleResponseStyle(id, value) {
    updatePreferences({
      ...preferences,
      responseStyle: {
        ...preferences.responseStyle,
        [id]: value,
      },
    });
  }

  function togglePriority(id) {
    const current = preferences.priorities || [];
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id];
    updatePreferences({
      ...preferences,
      priorities: next,
    });
  }

  function toggleNotification(id, value) {
    updatePreferences({
      ...preferences,
      notifications: {
        ...preferences.notifications,
        [id]: value,
      },
    });
  }

  return (
    <div
      className="mia-side-panel mia-side-panel--settings mia-settings-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Preferências da MIΛ"
    >
      <div className="mia-settings-hub-header">
        <div className="mia-settings-hub-header-copy">
          <p className="mia-settings-hub-eyebrow">Central Teilor</p>
          <h4 className="mia-settings-hub-title">
            Preferências da <MIAWordmark size="sm" />
          </h4>
          <p className="mia-settings-hub-subtitle">
            Personalize a forma como a MIΛ te ajuda a tomar decisões de compra.
          </p>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar preferências da MIΛ"
        >
          Fechar
        </button>
      </div>

      <section className="mia-settings-section" aria-labelledby="mia-settings-response-title">
        <h5 id="mia-settings-response-title" className="mia-settings-hub-section-title">
          <span aria-hidden="true">🧠</span> Como a MIΛ deve responder
        </h5>
        <p className="mia-settings-section-intro">
          Cada pessoa compra de um jeito diferente. Ajuste como você prefere receber recomendações.
        </p>
        <div className="mia-settings-toggle-list">
          {RESPONSE_OPTIONS.map((option) => (
            <PreferenceToggle
              key={option.id}
              title={option.title}
              text={option.text}
              checked={!!preferences.responseStyle?.[option.id]}
              onChange={(value) => toggleResponseStyle(option.id, value)}
            />
          ))}
        </div>
      </section>

      <section className="mia-settings-section" aria-labelledby="mia-settings-priority-title">
        <h5 id="mia-settings-priority-title" className="mia-settings-hub-section-title">
          <span aria-hidden="true">🛒</span> Suas prioridades de compra
        </h5>
        <p className="mia-settings-section-intro">
          Ajude a MIΛ a entender o que normalmente importa para você.
        </p>
        <div className="mia-settings-chip-list">
          {PRIORITY_OPTIONS.map((option) => {
            const selected = (preferences.priorities || []).includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                className={`mia-settings-chip${selected ? " mia-settings-chip--active" : ""}`}
                aria-pressed={selected}
                onClick={() => togglePriority(option.id)}
              >
                <span aria-hidden="true">{option.icon}</span>
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mia-settings-section" aria-labelledby="mia-settings-notify-title">
        <h5 id="mia-settings-notify-title" className="mia-settings-hub-section-title">
          <span aria-hidden="true">🔔</span> Notificações úteis
        </h5>
        <div className="mia-settings-toggle-list">
          {NOTIFICATION_OPTIONS.map((option) => (
            <PreferenceToggle
              key={option.id}
              title={option.title}
              text={option.text}
              checked={!!preferences.notifications?.[option.id]}
              onChange={(value) => toggleNotification(option.id, value)}
            />
          ))}
        </div>
      </section>

      <section className="mia-settings-section" aria-labelledby="mia-settings-appearance-title">
        <h5 id="mia-settings-appearance-title" className="mia-settings-hub-section-title">
          <span aria-hidden="true">🎨</span> Aparência
        </h5>
        <p className="mia-settings-section-intro">
          Escolha como prefere visualizar a plataforma.
        </p>
        <div className="mia-settings-appearance-grid">
          {APPEARANCE_OPTIONS.map((option) => (
            <div
              key={option.id}
              className={`mia-settings-appearance-card${
                option.status === "active" ? " mia-settings-appearance-card--active" : ""
              }${option.status === "soon" ? " mia-settings-appearance-card--soon" : ""}`}
            >
              <span className="mia-settings-appearance-label">{option.label}</span>
              <span className="mia-settings-appearance-badge">
                {option.status === "active" ? "Ativo" : "Em breve"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mia-settings-section" aria-labelledby="mia-settings-language-title">
        <h5 id="mia-settings-language-title" className="mia-settings-hub-section-title">
          <span aria-hidden="true">🌎</span> Idioma
        </h5>
        <div className="mia-settings-language-card">
          <p className="mia-settings-language-value">Português (BR)</p>
          <p className="mia-settings-language-note">
            Mais idiomas serão adicionados futuramente.
          </p>
        </div>
      </section>

      <section className="mia-settings-section" aria-labelledby="mia-settings-privacy-title">
        <h5 id="mia-settings-privacy-title" className="mia-settings-hub-section-title">
          <span aria-hidden="true">🔐</span> Privacidade e dados
        </h5>
        <p className="mia-settings-section-intro">
          Você continua no controle das suas informações.
        </p>
        <div className="mia-settings-privacy-card">
          <p className="mia-settings-privacy-title">Limpar cache local</p>
          <p className="mia-settings-privacy-text">
            Use apenas se o aplicativo parecer desatualizado ou apresentar algum comportamento estranho.
          </p>
          <button
            type="button"
            className="mia-settings-privacy-btn"
            onClick={onClearCache}
            disabled={cacheBusy}
          >
            {cacheBusy ? "Limpando cache..." : "Limpar cache local"}
          </button>
        </div>
      </section>

      <div className="mia-settings-hub-mia-note" role="note">
        <span className="mia-settings-hub-mia-dot" aria-hidden="true" />
        A MIΛ aprende continuamente com suas interações para oferecer recomendações mais úteis
        e alinhadas ao seu perfil.
      </div>
    </div>
  );
}
