import feedItemsMock from "../lib/feedItemsMock";

import FeedCard from "./FeedCard";

import FeedEmptyState from "./FeedEmptyState";

import FeedEducationSection from "./FeedEducationSection";

import FeedSwipeOnboarding from "./FeedSwipeOnboarding";



export default function FeedPanel({

  items = feedItemsMock,

  onClose,

  onScrollToChat,

  onFavorite,

  onMonitor,

  onAskMia,

  onOpenGallery,

  actionBusy,

}) {

  const hasItems = Array.isArray(items) && items.length > 0;



  return (

    <div

      className="mia-side-panel mia-side-panel--feed mia-feed-hub mia-hub-panel"

      role="dialog"

      aria-modal="true"

      aria-label="Feed Inteligente da MIΛ"

    >

      <div className="mia-feed-hub-topbar" role="note">

        <span className="mia-feed-hub-mia-dot" aria-hidden="true" />

        <p className="mia-feed-hub-topbar-text">

          Enquanto você vive sua rotina, a MIΛ continua procurando oportunidades por você.

        </p>

        <button

          type="button"

          className="mia-feed-hub-close-btn"

          onClick={onClose}

          aria-label="Fechar feed da MIΛ"

        >

          <span aria-hidden="true">✕</span>

        </button>

      </div>



      {!hasItems ? (

        <>

          <FeedEmptyState onScrollToChat={onScrollToChat} />

          <FeedEducationSection />

        </>

      ) : (

        <div className="mia-feed-viewport">

          <FeedSwipeOnboarding active={hasItems} />

          <div

            className="mia-feed-scroll"

            role="feed"

            aria-busy="false"

            aria-label="Sugestões da MIΛ, uma por vez"

          >

            {items.map((item) => (

              <div key={item.id} className="mia-feed-slide">

                <FeedCard

                  item={item}

                  onFavorite={onFavorite}

                  onMonitor={onMonitor}

                  onAskMia={onAskMia}

                  onOpenGallery={onOpenGallery}

                  actionBusy={actionBusy}

                />

              </div>

            ))}

            <div className="mia-feed-slide mia-feed-slide--footer">

              <div className="mia-feed-scroll-footer">

                <FeedEducationSection />

              </div>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}

