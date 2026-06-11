import { MIA_NO_SPAM_MESSAGE } from "../lib/miaTrustCopy";
import MIAAvatar from "./MIAAvatar";

const EDUCATION_ITEMS = [
  {
    icon: "✓",
    title: "Acompanhe oportunidades",
    text: "Veja de novo produtos que merecem atenção no seu momento.",
  },
  {
    icon: "✓",
    title: "Encontre novamente produtos importantes",
    text: "Guarde o que importa sem perder no meio de tantas abas.",
  },
  {
    icon: "✓",
    title: "Receba alertas de preço",
    text: "Ative monitoramento e seja avisado quando fizer sentido.",
  },
  {
    icon: "✓",
    title: "Compare antes de decidir",
    text: "Volte ao chat e peça ajuda para escolher com mais clareza.",
  },
];

function formatSavedDate(value) {
  if (!value) return null;
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch (_) {
    return null;
  }
}

function getStoreLabel(favorite) {
  if (favorite?.source && String(favorite.source).trim()) {
    return String(favorite.source).trim();
  }

  const link = favorite?.link || "";
  if (!link) return null;

  try {
    const host = new URL(link).hostname.replace(/^www\./i, "");
    return host || null;
  } catch (_) {
    return null;
  }
}

function favoriteToProduct(favorite) {
  return {
    product_name: favorite.product_name,
    title: favorite.product_name,
    price: favorite.price,
    link: favorite.link,
    thumbnail: favorite.thumbnail,
  };
}

export default function MIAFavoritesPanel({
  favorites = [],
  onClose,
  onScrollToChat,
  onAskMia,
  onMonitor,
  onRemove,
  formatPrice,
  actionBusy,
}) {
  const hasFavorites = favorites.length > 0;

  return (
    <div
      className="mia-side-panel mia-side-panel--favorites mia-favorites-hub mia-hub-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Favoritos Inteligentes"
    >
      <div className="mia-favorites-hub-header">
        <div className="mia-favorites-hub-header-copy">
          <p className="mia-favorites-hub-eyebrow">Central Teilor</p>
          <h4 className="mia-favorites-hub-title">
            <span aria-hidden="true">❤️</span> Favoritos Inteligentes
          </h4>
          <p className="mia-favorites-hub-subtitle">
            Acompanhe produtos, oportunidades e decisões que você não quer perder.
          </p>
        </div>
        <button
          type="button"
          className="mia-panel-close-btn"
          onClick={onClose}
          aria-label="Fechar favoritos inteligentes"
        >
          Fechar
        </button>
      </div>

      <div className="mia-favorites-hub-mia-note" role="note">
        <span className="mia-favorites-hub-mia-dot" aria-hidden="true" />
        A MIΛ continua acompanhando você mesmo quando o chat está fechado.
      </div>

      <p className="mia-hub-trust-note">{MIA_NO_SPAM_MESSAGE}</p>

      {!hasFavorites && (
        <div className="mia-favorites-hub-empty">
          <div className="mia-favorites-hub-empty-icon mia-hub-empty-mia-mark" aria-hidden="true">
            <MIAAvatar size="feed" alt="" />
          </div>
          <p className="mia-favorites-hub-empty-title">Nenhum favorito salvo ainda</p>
          <p className="mia-favorites-hub-empty-text">
            Quando você encontrar um produto interessante, a MIΛ pode ajudar você a
            acompanhar preços, oportunidades e decidir o melhor momento para comprar.
          </p>
          <button type="button" className="mia-favorites-hub-cta" onClick={onScrollToChat}>
            <span aria-hidden="true">💬</span>
            Conversar com a MIΛ
          </button>
        </div>
      )}

      {hasFavorites && (
        <div className="mia-favorites-hub-summary">
          <span className="mia-favorites-hub-summary-count">
            {favorites.length} {favorites.length === 1 ? "produto salvo" : "produtos salvos"}
          </span>
        </div>
      )}

      {hasFavorites && (
        <div className="mia-favorites-hub-list">
          {favorites.map((favorite) => {
            const savedDate = formatSavedDate(favorite.created_at);
            const storeLabel = getStoreLabel(favorite);
            const priceLabel = favorite.price ? formatPrice(favorite.price) : "";
            const busyRemove = actionBusy === `remove-${favorite.id}`;
            const busyMonitor = actionBusy === "monitor";

            return (
              <article key={favorite.id} className="mia-favorites-card">
                <div className="mia-favorites-card-main">
                  <div className="mia-favorites-card-media">
                    {favorite.thumbnail ? (
                      <img
                        src={favorite.thumbnail}
                        alt=""
                        className="mia-favorites-card-image"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="mia-favorites-card-fallback" aria-hidden="true">📦</span>
                    )}
                  </div>
                  <div className="mia-favorites-card-body">
                    <h5 className="mia-favorites-card-name">{favorite.product_name}</h5>
                    {priceLabel && priceLabel !== "Preço indisponível" && (
                      <p className="mia-favorites-card-price">{priceLabel}</p>
                    )}
                    {storeLabel && (
                      <p className="mia-favorites-card-store">{storeLabel}</p>
                    )}
                    {savedDate && (
                      <p className="mia-favorites-card-date">Salvo em {savedDate}</p>
                    )}
                  </div>
                </div>
                <div className="mia-favorites-card-actions">
                  <button
                    type="button"
                    className="mia-favorites-card-btn"
                    onClick={() => onAskMia(favorite)}
                    disabled={Boolean(actionBusy)}
                  >
                    <span aria-hidden="true">💬</span> Perguntar para a MIΛ
                  </button>
                  <button
                    type="button"
                    className="mia-favorites-card-btn"
                    onClick={() => onMonitor(favoriteToProduct(favorite))}
                    disabled={busyMonitor}
                  >
                    <span aria-hidden="true">🔔</span> Monitorar
                  </button>
                  <button
                    type="button"
                    className="mia-favorites-card-btn mia-favorites-card-btn--danger"
                    onClick={() => onRemove(favorite)}
                    disabled={busyRemove}
                  >
                    <span aria-hidden="true">🗑</span> Remover
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <section className="mia-favorites-hub-edu" aria-labelledby="mia-favorites-edu-title">
        <h5 id="mia-favorites-edu-title" className="mia-favorites-hub-edu-title">
          O que acontece quando você favorita um produto?
        </h5>
        <div className="mia-favorites-hub-edu-grid">
          {EDUCATION_ITEMS.map((item) => (
            <article key={item.title} className="mia-favorites-hub-edu-card">
              <span className="mia-favorites-hub-edu-icon" aria-hidden="true">{item.icon}</span>
              <div>
                <h6 className="mia-favorites-hub-edu-card-title">{item.title}</h6>
                <p className="mia-favorites-hub-edu-card-text">{item.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {hasFavorites && (
        <div className="mia-favorites-hub-footer-cta">
          <button type="button" className="mia-favorites-hub-cta mia-favorites-hub-cta--secondary" onClick={onScrollToChat}>
            <span aria-hidden="true">💬</span>
            Conversar com a MIΛ
          </button>
        </div>
      )}
    </div>
  );
}
