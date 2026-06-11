import { useEffect, useMemo, useState } from "react";
import { getFeedImageFallback } from "../lib/feedImageFallback";
import { getFeedItemGallery, resolveFeedItemImage } from "../lib/feedImageResolver";

function feedItemToProduct(item) {
  return {
    product_name: item.name,
    title: item.name,
    price: item.priceLabel || item.price,
    link: item.link,
    thumbnail: resolveFeedItemImage(item),
    source: item.store,
    store: item.store,
  };
}

export default function FeedCard({
  item,
  onFavorite,
  onMonitor,
  onAskMia,
  onOpenGallery,
  actionBusy,
}) {
  const product = feedItemToProduct(item);
  const busyFav = actionBusy === "favorite";
  const busyMon = actionBusy === "monitor";
  const fallback = getFeedImageFallback(item.category);
  const imageSrc = useMemo(() => resolveFeedItemImage(item), [item]);
  const galleryImages = useMemo(() => getFeedItemGallery(item), [item]);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    if (!imageSrc) {
      setImageReady(false);
      return undefined;
    }

    setImageReady(false);
    const probe = new Image();
    probe.onload = () => setImageReady(true);
    probe.onerror = () => setImageReady(false);
    probe.src = imageSrc;

    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [imageSrc]);

  const showRealImage = Boolean(imageSrc) && imageReady;
  const canOpenGallery = showRealImage && galleryImages.length > 0;

  function handleOpenGallery() {
    if (!canOpenGallery) return;
    onOpenGallery?.(item);
  }

  function renderMedia() {
    if (showRealImage && canOpenGallery) {
      return (
        <button
          type="button"
          className="mia-feed-card-media-wrap mia-feed-card-media-wrap--clickable"
          onClick={handleOpenGallery}
          aria-label={`Ver fotos de ${item.name}`}
        >
          <img
            src={imageSrc}
            alt={item.name}
            className="mia-feed-card-image"
            loading="lazy"
            decoding="async"
          />
          <span className="mia-feed-card-badge">
            <span className="mia-feed-card-badge-spark" aria-hidden="true">✨</span>
            Sugestão da MIΛ
          </span>
          {galleryImages.length > 1 && (
            <span className="mia-feed-card-gallery-hint" aria-hidden="true">
              {galleryImages.length} fotos
            </span>
          )}
        </button>
      );
    }

    if (showRealImage) {
      return (
        <div className="mia-feed-card-media-wrap">
          <img
            src={imageSrc}
            alt={item.name}
            className="mia-feed-card-image"
            loading="lazy"
            decoding="async"
          />
          <span className="mia-feed-card-badge">
            <span className="mia-feed-card-badge-spark" aria-hidden="true">✨</span>
            Sugestão da MIΛ
          </span>
        </div>
      );
    }

    return (
      <div className="mia-feed-card-media-wrap">
        <div
          className="mia-feed-card-image-fallback"
          role="img"
          aria-label={`Imagem indisponível: ${fallback.label}`}
        >
          <span className="mia-feed-card-image-fallback-glow" aria-hidden="true" />
          <span className="mia-feed-card-image-fallback-emoji" aria-hidden="true">
            {fallback.emoji}
          </span>
          <span className="mia-feed-card-image-fallback-label">{fallback.label}</span>
        </div>
        <span className="mia-feed-card-badge">
          <span className="mia-feed-card-badge-spark" aria-hidden="true">✨</span>
          Sugestão da MIΛ
        </span>
      </div>
    );
  }

  return (
    <article className="mia-feed-card" aria-label={`Sugestão: ${item.name}`}>
      {renderMedia()}

      <p className="mia-feed-card-scroll-hint" aria-hidden="true">
        <span className="mia-feed-card-scroll-hint-icon">↓</span>
        Deslize para ler mais
      </p>

      <div className="mia-feed-card-body">
        <p className="mia-feed-card-category">{item.category}</p>
        <h3 className="mia-feed-card-name">{item.name}</h3>
        <div className="mia-feed-card-meta">
          <span className="mia-feed-card-price">{item.priceLabel}</span>
          <span className="mia-feed-card-store">{item.store}</span>
        </div>

        <div className="mia-feed-card-insight" role="note">
          <p className="mia-feed-card-insight-text">{item.miaInsight}</p>
        </div>

        <section className="mia-feed-card-section" aria-label="O que chama atenção">
          <h4 className="mia-feed-card-section-title">
            <span aria-hidden="true">👍</span> O que chama atenção
          </h4>
          <ul className="mia-feed-card-list">
            {item.highlights.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="mia-feed-card-section" aria-label="Vale saber antes de comprar">
          <h4 className="mia-feed-card-section-title">
            <span aria-hidden="true">⚠️</span> Vale saber antes de comprar
          </h4>
          <ul className="mia-feed-card-list mia-feed-card-list--muted">
            {item.watchOuts.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section className="mia-feed-card-section mia-feed-card-section--price" aria-label="Melhor preço encontrado">
          <h4 className="mia-feed-card-section-title">
            <span aria-hidden="true">💰</span> Melhor preço encontrado
          </h4>
          <p className="mia-feed-card-best-price">{item.bestPrice?.priceLabel || item.priceLabel}</p>
          <p className="mia-feed-card-best-store">{item.bestPrice?.store || item.store}</p>
        </section>

        <div className="mia-feed-card-actions">
          <div className="mia-feed-card-actions-row mia-feed-card-actions-row--pair">
            <button
              type="button"
              className="mia-feed-action-btn"
              onClick={() => onFavorite?.(product)}
              disabled={busyFav}
              aria-label={`Favoritar ${item.name}`}
            >
              <span aria-hidden="true">❤️</span>
              Favoritar
            </button>
            <button
              type="button"
              className="mia-feed-action-btn"
              onClick={() => onMonitor?.(product)}
              disabled={busyMon}
              aria-label={`Monitorar ${item.name}`}
            >
              <span aria-hidden="true">🔔</span>
              Monitorar
            </button>
          </div>
          <div className="mia-feed-card-actions-row mia-feed-card-actions-row--solo">
            <button
              type="button"
              className="mia-feed-action-btn mia-feed-action-btn--ask"
              onClick={() => onAskMia?.(product)}
              aria-label={`Perguntar para a MIΛ sobre ${item.name}`}
            >
              <span aria-hidden="true">💬</span>
              Perguntar para a MIΛ
            </button>
          </div>
          <div className="mia-feed-card-actions-row mia-feed-card-actions-row--solo">
            {item.link ? (
              <a
                className="mia-feed-action-btn mia-feed-action-btn--primary"
                href={item.link}
                target="_blank"
                rel="noreferrer"
                aria-label={`Ver oferta de ${item.name}`}
              >
                <span aria-hidden="true">🛒</span>
                Ver oferta
              </a>
            ) : (
              <span className="mia-feed-action-btn mia-feed-action-btn--disabled" aria-disabled="true">
                <span aria-hidden="true">🛒</span>
                Ver oferta
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
