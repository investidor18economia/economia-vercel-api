import { useEffect, useState } from "react";

const STORAGE_KEY = "mia_feed_swipe_onboarding_v1";
const AUTO_DISMISS_MS = 3200;

export function hasSeenFeedSwipeOnboarding() {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function markFeedSwipeOnboardingSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export default function FeedSwipeOnboarding({ active, onDone }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!active || hasSeenFeedSwipeOnboarding()) {
      setVisible(false);
      return undefined;
    }

    setVisible(true);
    setLeaving(false);

    const dismissTimer = window.setTimeout(() => {
      setLeaving(true);
    }, AUTO_DISMISS_MS - 420);

    const hideTimer = window.setTimeout(() => {
      markFeedSwipeOnboardingSeen();
      setVisible(false);
      onDone?.();
    }, AUTO_DISMISS_MS);

    return () => {
      window.clearTimeout(dismissTimer);
      window.clearTimeout(hideTimer);
    };
  }, [active, onDone]);

  if (!visible) return null;

  return (
    <div
      className={`mia-feed-onboarding${leaving ? " mia-feed-onboarding--leaving" : ""}`}
      role="status"
      aria-live="polite"
      aria-label="Dica: arraste para ver mais sugestões"
    >
      <div className="mia-feed-onboarding-content">
        <span className="mia-feed-onboarding-hand" aria-hidden="true">
          👆
        </span>
        <span className="mia-feed-onboarding-swipe-track" aria-hidden="true">
          <span className="mia-feed-onboarding-swipe-dot" />
        </span>
        <p className="mia-feed-onboarding-text">
          Arraste para descobrir novas sugestões da MIΛ
        </p>
      </div>
    </div>
  );
}
