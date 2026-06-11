import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_MOVE_PX = 14;

function addImageUrl(urls, seen, value) {
  if (Array.isArray(value)) {
    value.forEach((item) => addImageUrl(urls, seen, item));
    return;
  }
  if (value && typeof value === "object") {
    addImageUrl(urls, seen, value.url);
    addImageUrl(urls, seen, value.src);
    addImageUrl(urls, seen, value.image);
    addImageUrl(urls, seen, value.thumbnail);
    return;
  }
  if (typeof value !== "string") return;
  const url = value.trim();
  if (!url || seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}

export function getOfferCardImages(card = {}) {
  const urls = [];
  const seen = new Set();

  addImageUrl(urls, seen, card.images);
  addImageUrl(urls, seen, card.thumbnails);
  addImageUrl(urls, seen, card.product_images);
  addImageUrl(urls, seen, card.gallery);
  addImageUrl(urls, seen, card.photos);
  addImageUrl(urls, seen, card.media);

  if (card.offer && typeof card.offer === "object") {
    addImageUrl(urls, seen, card.offer.images);
    addImageUrl(urls, seen, card.offer.thumbnails);
    addImageUrl(urls, seen, card.offer.product_images);
    addImageUrl(urls, seen, card.offer.gallery);
    addImageUrl(urls, seen, card.offer.photos);
    addImageUrl(urls, seen, card.offer.media);
    addImageUrl(urls, seen, card.offer.image);
    addImageUrl(urls, seen, card.offer.thumbnail);
    addImageUrl(urls, seen, card.offer.imageUrl);
  }

  addImageUrl(urls, seen, card.image);
  addImageUrl(urls, seen, card.imageUrl);
  addImageUrl(urls, seen, card.thumbnail);

  return urls;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distanceBetweenTouches(touchA, touchB) {
  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;
  return Math.hypot(dx, dy);
}

export default function OfferImageLightbox({ lightbox, onClose }) {
  const closeBtnRef = useRef(null);
  const swipeRef = useRef({ tracking: false, startX: 0, startY: 0 });
  const stageRef = useRef(null);
  const zoomRef = useRef({
    scale: 1,
    translateX: 0,
    translateY: 0,
    pinching: false,
    pinchStartDistance: 0,
    pinchStartScale: 1,
    lastTapAt: 0,
    lastTapX: 0,
    lastTapY: 0,
    panning: false,
    panStartX: 0,
    panStartY: 0,
    panOriginX: 0,
    panOriginY: 0,
  });

  const [index, setIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [zoomState, setZoomState] = useState({ scale: 1, translateX: 0, translateY: 0 });

  const open = Boolean(lightbox?.images?.length);
  const images = lightbox?.images || [];
  const title = lightbox?.title || "Produto";
  const total = images.length;
  const hasMultiple = total > 1;
  const currentSrc = images[index] || "";
  const isZoomed = zoomState.scale > 1.02;

  const resetZoom = useCallback(() => {
    zoomRef.current.scale = 1;
    zoomRef.current.translateX = 0;
    zoomRef.current.translateY = 0;
    setZoomState({ scale: 1, translateX: 0, translateY: 0 });
  }, []);

  const applyZoom = useCallback((nextScale, nextX = zoomRef.current.translateX, nextY = zoomRef.current.translateY) => {
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const translateX = scale <= 1 ? 0 : nextX;
    const translateY = scale <= 1 ? 0 : nextY;
    zoomRef.current.scale = scale;
    zoomRef.current.translateX = translateX;
    zoomRef.current.translateY = translateY;
    setZoomState({ scale, translateX, translateY });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setIndex(lightbox?.index || 0);
    setImageFailed(false);
    resetZoom();
  }, [open, lightbox?.index, lightbox?.images, resetZoom]);

  useEffect(() => {
    if (!open) return undefined;
    setImageFailed(false);
    resetZoom();
  }, [open, index, currentSrc, resetZoom]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    document.body.classList.add("mia-image-lightbox-open");
    return () => document.body.classList.remove("mia-image-lightbox-open");
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (isZoomed) {
          resetZoom();
          return;
        }
        onClose();
        return;
      }
      if (isZoomed) return;
      if (event.key === "ArrowLeft" && index > 0) {
        setIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "ArrowRight" && index < total - 1) {
        setIndex((current) => Math.min(total - 1, current + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, index, total, onClose, isZoomed, resetZoom]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      closeBtnRef.current?.focus({ preventScroll: true });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, index]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const MIN_SWIPE = 48;
    const stage = stageRef.current;
    if (!stage) return undefined;

    function onTouchStart(event) {
      const zoom = zoomRef.current;

      if (event.touches.length === 2) {
        zoom.pinching = true;
        zoom.panning = false;
        swipeRef.current.tracking = false;
        zoom.pinchStartDistance = distanceBetweenTouches(event.touches[0], event.touches[1]);
        zoom.pinchStartScale = zoom.scale;
        return;
      }

      if (event.touches.length !== 1) return;

      const touch = event.touches[0];

      if (zoom.scale > 1) {
        zoom.panning = true;
        zoom.panStartX = touch.clientX;
        zoom.panStartY = touch.clientY;
        zoom.panOriginX = zoom.translateX;
        zoom.panOriginY = zoom.translateY;
        swipeRef.current.tracking = false;
        return;
      }

      swipeRef.current = {
        tracking: true,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    }

    function onTouchMove(event) {
      const zoom = zoomRef.current;

      if (zoom.pinching && event.touches.length === 2) {
        event.preventDefault();
        const distance = distanceBetweenTouches(event.touches[0], event.touches[1]);
        if (!zoom.pinchStartDistance) return;
        const nextScale = zoom.pinchStartScale * (distance / zoom.pinchStartDistance);
        applyZoom(nextScale);
        return;
      }

      if (zoom.panning && event.touches.length === 1 && zoom.scale > 1) {
        event.preventDefault();
        const touch = event.touches[0];
        const deltaX = touch.clientX - zoom.panStartX;
        const deltaY = touch.clientY - zoom.panStartY;
        applyZoom(zoom.scale, zoom.panOriginX + deltaX, zoom.panOriginY + deltaY);
      }
    }

    function onTouchEnd(event) {
      const zoom = zoomRef.current;

      if (zoom.pinching) {
        zoom.pinching = false;
        if (zoom.scale < 1.04) resetZoom();
        return;
      }

      if (zoom.panning) {
        zoom.panning = false;
        return;
      }

      const swipe = swipeRef.current;
      if (!swipe.tracking || zoomRef.current.scale > 1.02) return;
      swipe.tracking = false;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const now = Date.now();
      const deltaFromLastTapX = Math.abs(touch.clientX - zoom.lastTapX);
      const deltaFromLastTapY = Math.abs(touch.clientY - zoom.lastTapY);
      if (
        now - zoom.lastTapAt <= DOUBLE_TAP_MS
        && deltaFromLastTapX <= DOUBLE_TAP_MOVE_PX
        && deltaFromLastTapY <= DOUBLE_TAP_MOVE_PX
      ) {
        if (zoom.scale > 1.02) {
          resetZoom();
        } else {
          applyZoom(2.4);
        }
        zoom.lastTapAt = 0;
        return;
      }

      zoom.lastTapAt = now;
      zoom.lastTapX = touch.clientX;
      zoom.lastTapY = touch.clientY;

      const deltaX = touch.clientX - swipe.startX;
      const deltaY = touch.clientY - swipe.startY;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) return;
      if (Math.abs(deltaX) < MIN_SWIPE) return;

      if (deltaX < 0 && index < total - 1) {
        setIndex((current) => Math.min(total - 1, current + 1));
      } else if (deltaX > 0 && index > 0) {
        setIndex((current) => Math.max(0, current - 1));
      }
    }

    stage.addEventListener("touchstart", onTouchStart, { passive: false });
    stage.addEventListener("touchmove", onTouchMove, { passive: false });
    stage.addEventListener("touchend", onTouchEnd, { passive: true });
    stage.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchmove", onTouchMove);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [open, index, total, isZoomed, applyZoom, resetZoom]);

  function handleImageDoubleClick() {
    if (zoomRef.current.scale > 1.02) {
      resetZoom();
      return;
    }
    applyZoom(2.2);
  }

  if (!open || typeof document === "undefined") return null;

  const goPrev = () => {
    if (isZoomed) {
      resetZoom();
      return;
    }
    setIndex((current) => Math.max(0, current - 1));
  };

  const goNext = () => {
    if (isZoomed) {
      resetZoom();
      return;
    }
    setIndex((current) => Math.min(total - 1, current + 1));
  };

  const imageTransform = `translate3d(${zoomState.translateX}px, ${zoomState.translateY}px, 0) scale(${zoomState.scale})`;

  return createPortal(
    <div
      className="mia-image-lightbox-root"
      role="dialog"
      aria-modal="true"
      aria-label={`Galeria de imagens: ${title}`}
    >
      <button
        type="button"
        className="mia-image-lightbox-overlay"
        onClick={onClose}
        aria-label="Fechar galeria"
      />
      <div className="mia-image-lightbox-panel">
        <header className="mia-image-lightbox-header">
          <p className="mia-image-lightbox-title">{title}</p>
          {hasMultiple && (
            <p className="mia-image-lightbox-counter" aria-live="polite">
              {index + 1} / {total}
            </p>
          )}
          <button
            ref={closeBtnRef}
            type="button"
            className="mia-image-lightbox-close"
            onClick={onClose}
            aria-label="Fechar galeria"
          >
            ✕
          </button>
        </header>

        <div
          ref={stageRef}
          className={`mia-image-lightbox-stage${isZoomed ? " mia-image-lightbox-stage--zoomed" : ""}`}
        >
          {hasMultiple && (
            <button
              type="button"
              className="mia-image-lightbox-nav mia-image-lightbox-nav--prev"
              onClick={goPrev}
              disabled={!isZoomed && index === 0}
              aria-label="Imagem anterior"
            >
              ‹
            </button>
          )}

          <div className="mia-image-lightbox-frame">
            {imageFailed ? (
              <div className="mia-image-lightbox-fallback" role="img" aria-label="Imagem indisponível">
                <span className="mia-image-lightbox-fallback-icon" aria-hidden="true">📦</span>
                <p>Imagem indisponível</p>
              </div>
            ) : (
              <div className="mia-image-lightbox-zoom-shell">
                <img
                  key={currentSrc}
                  src={currentSrc}
                  alt={hasMultiple ? `${title} — imagem ${index + 1} de ${total}` : title}
                  className="mia-image-lightbox-image"
                  decoding="async"
                  draggable={false}
                  style={{ transform: imageTransform }}
                  onDoubleClick={handleImageDoubleClick}
                  onError={() => setImageFailed(true)}
                />
              </div>
            )}
          </div>

          {hasMultiple && (
            <button
              type="button"
              className="mia-image-lightbox-nav mia-image-lightbox-nav--next"
              onClick={goNext}
              disabled={!isZoomed && index === total - 1}
              aria-label="Próxima imagem"
            >
              ›
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
