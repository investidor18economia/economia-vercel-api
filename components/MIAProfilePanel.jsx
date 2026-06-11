import MIAWordmark from "./MIAWordmark";
import MIAAvatar from "./MIAAvatar";

const BUILT_ITEMS = [
  {
    icon: "❤️",
    title: "Favoritos ajudam a acompanhar produtos importantes",
    text: "Guarde o que importa e volte quando quiser decidir com calma.",
  },
  {
    icon: "🔔",
    title: "Alertas permitem monitorar oportunidades",
    text: "A MIΛ observa para você e avisa quando surgir um bom momento.",
  },
  {
    icon: "💬",
    title: "Conversas ajudam a MIΛ a entender seu contexto",
    text: "Quanto mais você compartilha, mais útil fica a orientação.",
  },
  {
    icon: "🎯",
    title: "Quanto mais você usa, melhores ficam as recomendações",
    text: "Sua jornada na Teilor fica mais personalizada com o tempo.",
  },
];

function formatMemberSince(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch (_) {
    return null;
  }
}

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "🙂";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function MetricCard({ icon, label, value, placeholder = false }) {
  return (
    <article className="mia-profile-metric-card">
      <span className="mia-profile-metric-icon" aria-hidden="true">{icon}</span>
      <p className="mia-profile-metric-label">{label}</p>
      {placeholder ? (
        <>
          <p className="mia-profile-metric-value mia-profile-metric-value--placeholder">—</p>
          <p className="mia-profile-metric-hint">Em construção</p>
        </>
      ) : (
        <p className="mia-profile-metric-value">{value}</p>
      )}
    </article>
  );
}

function resolveNextStep({ alertsCount, favoritesCount }) {
  if (alertsCount === 0) {
    return {
      message: "A MIΛ percebeu que você ainda não possui alertas ativos.",
      cta: "Ver Alertas Inteligentes",
      action: "alerts",
    };
  }

  if (favoritesCount === 0) {
    return {
      message: "Ainda não há produtos favoritos.",
      cta: "Explorar Favoritos",
      action: "favorites",
    };
  }

  return {
    message: "Continue conversando com a MIΛ para receber recomendações mais personalizadas.",
    cta: "Conversar com a MIΛ",
    action: "chat",
  };
}

export default function MIAProfilePanel({
  user,
  displayName,
  profilePhoto = "",
  metrics = {},
  preferences = [],
  onClose,
  onEditProfile,
  onOpenAlerts,
  onOpenFavorites,
  onScrollToChat,
}) {
  const memberSince = formatMemberSince(user?.created_at);
  const email = user?.email?.trim() || "";
  const hasPreferences = preferences.length > 0;
  const nextStep = resolveNextStep({
    alertsCount: metrics.alerts ?? 0,
    favoritesCount: metrics.favorites ?? 0,
  });

  function handleNextStep() {
    if (nextStep.action === "alerts") {
      onOpenAlerts();
      return;
    }
    if (nextStep.action === "favorites") {
      onOpenFavorites();
      return;
    }
    onScrollToChat();
  }

  return (
    <div
      className="mia-side-panel mia-side-panel--profile mia-profile-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Seu Espaço na Teilor"
    >
      <div className="mia-profile-hub-header">
        <div className="mia-profile-hub-header-copy">
          <div className="mia-profile-hub-mia-mark" aria-hidden="true">
            <MIAAvatar size="profile" alt="MIΛ" />
          </div>
          <p className="mia-profile-hub-eyebrow">Central Teilor</p>
          <h4 className="mia-profile-hub-title">Seu Espaço na Teilor</h4>
          <p className="mia-profile-hub-subtitle">
            Acompanhe sua evolução, suas preferências e tudo o que a MIΛ está aprendendo
            para te ajudar a decidir melhor.
          </p>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar seu espaço na Teilor"
        >
          Fechar
        </button>
      </div>

      <div className="mia-profile-hub-mia-note" role="note">
        <span className="mia-profile-hub-mia-dot" aria-hidden="true" />
        A MIΛ continua aprendendo com suas interações para ajudar você a tomar decisões
        melhores ao longo do tempo.
      </div>

      <section className="mia-profile-user-card" aria-labelledby="mia-profile-user-title">
        <div className="mia-profile-user-main">
          <div className="mia-profile-user-avatar" aria-hidden="true">
            {profilePhoto ? (
              <img src={profilePhoto} alt="" className="mia-profile-user-avatar-image" />
            ) : (
              getInitials(displayName)
            )}
          </div>
          <div className="mia-profile-user-copy">
            <h5 id="mia-profile-user-title" className="mia-profile-user-name">
              {displayName}
            </h5>
            {email ? (
              <p className="mia-profile-user-email">{email}</p>
            ) : (
              <p className="mia-profile-user-email mia-profile-user-email--muted">
                Entre com seu email para personalizar sua jornada
              </p>
            )}
            {memberSince ? (
              <p className="mia-profile-user-since">Membro desde {memberSince}</p>
            ) : (
              <p className="mia-profile-user-since mia-profile-user-since--muted">
                Membro desde — <span className="mia-profile-inline-hint">Em construção</span>
              </p>
            )}
          </div>
        </div>

        <div className="mia-profile-user-badge">
          <span className="mia-profile-user-badge-icon" aria-hidden="true">🧠</span>
          <div>
            <p className="mia-profile-user-badge-title">Comprador Inteligente</p>
            <p className="mia-profile-user-badge-text">Acompanha produtos antes de decidir.</p>
          </div>
        </div>

        <button type="button" className="mia-profile-user-edit" onClick={onEditProfile}>
          Editar perfil
        </button>
      </section>

      <section className="mia-profile-journey" aria-labelledby="mia-profile-journey-title">
        <h5 id="mia-profile-journey-title" className="mia-profile-hub-section-title">
          Sua Jornada com a Teilor
        </h5>
        <div className="mia-profile-metrics-grid">
          <MetricCard
            icon="📦"
            label="Produtos analisados"
            value={metrics.productsAnalyzed}
            placeholder={metrics.productsAnalyzed == null}
          />
          <MetricCard
            icon="❤️"
            label="Favoritos salvos"
            value={metrics.favorites}
            placeholder={metrics.favorites == null}
          />
          <MetricCard
            icon="🔔"
            label="Alertas ativos"
            value={metrics.alerts}
            placeholder={metrics.alerts == null}
          />
          <MetricCard
            icon="💬"
            label={(
              <>
                Conversas com a <MIAWordmark size="xs" />
              </>
            )}
            value={metrics.conversations}
            placeholder={metrics.conversations == null}
          />
        </div>
      </section>

      <section className="mia-profile-learning" aria-labelledby="mia-profile-learning-title">
        <h5 id="mia-profile-learning-title" className="mia-profile-hub-section-title">
          Como a <MIAWordmark size="xs" /> está te conhecendo
        </h5>
        <p className="mia-profile-learning-intro">
          Conforme você conversa com a MIΛ, ela começa a entender melhor suas preferências
          para oferecer recomendações cada vez mais úteis.
        </p>

        {!hasPreferences && (
          <div className="mia-profile-learning-empty">
            <p className="mia-profile-learning-empty-text">
              Ainda estamos aprendendo mais sobre você.
            </p>
          </div>
        )}

        {hasPreferences && (
          <div className="mia-profile-preferences-grid">
            {preferences.map((item) => (
              <article key={item.id || item.title} className="mia-profile-preference-card">
                <span className="mia-profile-preference-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <p className="mia-profile-preference-text">{item.title}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mia-profile-built" aria-labelledby="mia-profile-built-title">
        <h5 id="mia-profile-built-title" className="mia-profile-hub-section-title">
          O que você já construiu
        </h5>
        <div className="mia-profile-built-grid">
          {BUILT_ITEMS.map((item) => (
            <article key={item.title} className="mia-profile-built-card">
              <span className="mia-profile-built-icon" aria-hidden="true">{item.icon}</span>
              <div>
                <h6 className="mia-profile-built-title">{item.title}</h6>
                <p className="mia-profile-built-text">{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mia-profile-next" aria-labelledby="mia-profile-next-title">
        <h5 id="mia-profile-next-title" className="mia-profile-hub-section-title">
          Próximo passo recomendado
        </h5>
        <article className="mia-profile-next-card">
          <p className="mia-profile-next-message">{nextStep.message}</p>
          <button type="button" className="mia-profile-hub-cta" onClick={handleNextStep}>
            {nextStep.cta}
          </button>
        </article>
      </section>
    </div>
  );
}
