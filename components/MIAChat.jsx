import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import OfferImageLightbox, { getOfferCardImages } from "./OfferImageLightbox";
import MIAAvatar from "./MIAAvatar";
import MIAWordmark from "./MIAWordmark";
import ChatImageAttachment from "./ChatImageAttachment";
import MIAFavoritesPanel from "./MIAFavoritesPanel";
import MIAAlertsPanel from "./MIAAlertsPanel";
import MIAProfilePanel from "./MIAProfilePanel";
import MIAProfileEditPanel from "./MIAProfileEditPanel";
import MIASettingsPanel from "./MIASettingsPanel";
import MIAHelpPanel from "./MIAHelpPanel";
import FeedPanel from "./FeedPanel";
import MIAMenuSymbol from "./MIAMenuSymbol";
import { getFeedItemGallery } from "../lib/feedImageResolver";
import { findProductByIdentity, getProductIdentityKey } from "../lib/productIdentity";
import { loadStoredUser, loadUserProfile, saveStoredUser, saveUserProfile } from "../lib/userProfileStorage";
import { readImageFileAsDataUrl, validateImageFile } from "../lib/chatImageFile";
import { requestImageAnalysis } from "../lib/imageAnalysisClient";
import {
  buildMiaOpening,
  buildOpeningHistoryEntry,
  clearSessionOpeningState,
  getOpeningTypingDelayMs,
  resolveStoredSessionOpening
} from "../lib/miaOpeningSystem";
import { getCognitiveLoadingFallbackState } from "../lib/miaCognitiveLoading.js";
import {
  shouldUseStructuredParagraphs,
  splitAssistantParagraphs,
} from "../lib/miaFrontendParagraphRendering.js";
import {
  buildEstimatedSavingsMessage,
  markPremiumSavingsShown,
  shouldShowPremiumSavingsOnSearch
} from "../lib/miaEstimatedSavings";
import { resolveOfferCardPresentation } from "../lib/miaCommercialFallbackDisplay.js";
import MIAEstimatedSavingsNotice from "./MIAEstimatedSavingsNotice";
import MIAHowItWorksPanel from "./MIAHowItWorksPanel";
import {
  trackMiaEvent,
  detectAnalyticsCategory,
  trackMiaSessionStarted
} from "../lib/analytics";
const PLACEHOLDER_PHRASES = [
  "Estou pensando em comprar um celular até R$ 2.000",
  "Qual notebook faz sentido para trabalhar?",
  "PS5 Slim ou Xbox Series X?",
  "Quero um fone custo-benefício",
  "Preciso de ajuda para escolher uma TV 4K",
  "Vale a pena trocar meu iPhone agora?"
];
const PLACEHOLDER_CYCLE_MS = 2000;

function getOfferCardTitle(card = {}) {
  const title = card.product_name || card.title || "";
  return String(title).trim() || "Produto";
}

function renderOpeningUtterance(microturn, basePhrase, fallbackResposta = "") {
  const lead = String(microturn || "").trim();
  let invite = String(basePhrase || "").trim();
  if (!invite) {
    invite = String(fallbackResposta || "").trim().replace(/\n\n+/g, " ");
  }
  if (!lead) return invite;
  if (!invite) return lead;
  const gap = /[.!?…]$/.test(lead) ? " " : ". ";
  return (
    <>
      <span className="mia-opening-utterance__lead">{lead}</span>
      {gap}
      <span className="mia-opening-utterance__invite">{invite}</span>
    </>
  );
}

function OfferCardMedia({ src, alt, onOpenGallery, galleryEnabled }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showFallback = !src || failed;
  const canOpenGallery = galleryEnabled && !showFallback && typeof onOpenGallery === "function";

  const mediaClass = `mia-offer-card-media${showFallback ? " mia-offer-card-media--fallback" : ""}${
    canOpenGallery ? " mia-offer-card-media--clickable" : ""
  }`;

  const mediaContent = showFallback ? (
    <div className="mia-offer-card-image-fallback" aria-hidden="true">
      <span className="mia-offer-card-image-fallback-icon">📦</span>
    </div>
  ) : (
    <img
      className="mia-offer-card-image"
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );

  if (canOpenGallery) {
    return (
      <button
        type="button"
        className={mediaClass}
        onClick={onOpenGallery}
        aria-label={`Ampliar imagem de ${alt}`}
      >
        {mediaContent}
      </button>
    );
  }

  return <div className={mediaClass}>{mediaContent}</div>;
}

export default function MIAChat() {
  const [msg, setMsg] = useState(""); 
  const [loading, setLoading] = useState(false);
  const [sessionContext, setSessionContext] = useState({});
  const [typing, setTyping] = useState(false);
  const [history, setHistory] = useState([]);
  const [greetingShown, setGreetingShown] = useState(false);
  const [openingTyping, setOpeningTyping] = useState(false);
  const [user, setUser] = useState(null);
  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [alertsPanelOpen, setAlertsPanelOpen] = useState(false);
  const [profilePanelOpen, setProfilePanelOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [helpPanelOpen, setHelpPanelOpen] = useState(false);
  const [howItWorksPanelOpen, setHowItWorksPanelOpen] = useState(false);
  const [feedPanelOpen, setFeedPanelOpen] = useState(false);
  const [profileEditPanelOpen, setProfileEditPanelOpen] = useState(false);
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({ displayName: "", photoDataUrl: "" });
  const [sideMenuOpen, setSideMenuOpen] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [watches, setWatches] = useState([]);
  const [revealText, setRevealText] = useState("");
  const [cognitiveLoading, setCognitiveLoading] = useState(() => getCognitiveLoadingFallbackState());
  const cognitiveLoadingAbortRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedImageBase64, setSelectedImageBase64] = useState("");
  const [selectedImagePreview, setSelectedImagePreview] = useState("");
  const [imageAttachmentMeta, setImageAttachmentMeta] = useState(null);
  const [imageAnalysisLoading, setImageAnalysisLoading] = useState(false);
  const [estimatedSavingsMessage, setEstimatedSavingsMessage] = useState(null);
  const [estimatedSavingsTurnId, setEstimatedSavingsTurnId] = useState(null);
  const [achievementToast, setAchievementToast] = useState(null);
  const [actionToast, setActionToast] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [offerImageLightbox, setOfferImageLightbox] = useState(null);

  const sessionSearchCount = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    sessionSearchCount.current = parseInt(
      window.sessionStorage.getItem("mia_search_count") || "0",
      10
    );
  }, []);
  useEffect(() => {
    trackMiaSessionStarted();
  }, []);
  function incrementSessionSearchCount() {
    sessionSearchCount.current += 1;
    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "mia_search_count",
        String(sessionSearchCount.current)
      );
    }
  }

  /** Notificação premium de economia estimada — uma vez por sessão, após 1ª busca. */
  function tryShowEstimatedSavingsNotice(apiData, productsRaw, turnId = null) {
    if (!shouldShowPremiumSavingsOnSearch(sessionSearchCount.current)) return;

    const message = buildEstimatedSavingsMessage(apiData, productsRaw);
    if (!message) return;

    markPremiumSavingsShown();
    setEstimatedSavingsMessage(message);
    setEstimatedSavingsTurnId(turnId);
  }

  function clearEstimatedSavingsNotice() {
    setEstimatedSavingsMessage(null);
    setEstimatedSavingsTurnId(null);
  }

  // ── CONQUISTAS ──────────────────────────────────────────────────────────────
  const ACHIEVEMENTS = [
    { id: "first_search", label: "🎯 Primeira busca feita!", trigger: (c) => c === 1 },
    { id: "five_searches", label: "🔥 5 buscas realizadas!", trigger: (c) => c === 5 },
    { id: "ten_searches", label: "🚀 10 buscas feitas!", trigger: (c) => c === 10 },
    { id: "active_user", label: "⚡ Usuário ativo!", trigger: (c) => c === 3 },
    { id: "price_hunter", label: "🕵️ Caçador de preço!", trigger: (c) => c === 7 },
    { id: "smart_choice", label: "💡 Escolha inteligente!", trigger: (c) => c === 15 },
  ];

  function tryShowAchievement(count) {
    const unlocked = JSON.parse(localStorage.getItem("mia_achievements") || "[]");
    for (const a of ACHIEVEMENTS) {
      if (!unlocked.includes(a.id) && a.trigger(count)) {
        unlocked.push(a.id);
        localStorage.setItem("mia_achievements", JSON.stringify(unlocked));
        setAchievementToast(a.label);
        setTimeout(() => setAchievementToast(null), 3500);
        break;
      }
    }
  }

  const revealInterval = useRef(null);
  const placeholderTimerRef = useRef(null);
  const placeholderTextRef = useRef(null);
  const placeholderActiveRef = useRef(false);
  const placeholderReducedMotionRef = useRef(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const messagesEndRef = useRef(null);
  const footerRef = useRef(null);
  const chatRootRef = useRef(null);
  const drawerSwipeRef = useRef({ tracking: false, startX: 0, startY: 0 });
  const sideMenuOpenRef = useRef(false);
  const hubPanelOpenRef = useRef(false);
  const profileEditPanelOpenRef = useRef(false);
  const offerImageLightboxRef = useRef(null);
  const miaNavProgrammaticRef = useRef(false);
  const miaNavFromPopstateRef = useRef(false);
  const prevOverlayCountRef = useRef(0);
  const panelReturnToMenuRef = useRef(false);
  const blockSwipeRef = useRef(false);
  const keyboardOpenRef = useRef(false);
  const inputFocusedRef = useRef(false);
  const keyboardRafRef = useRef(null);
  const applyKeyboardMetricsRef = useRef(() => {});
  const requestIdRef = useRef(0);
  const recognitionRef = useRef(null);
  const speechTranscriptRef = useRef("");
  const speechBaseMsgRef = useRef("");
  const conversationIdRef = useRef(null);
  const actionToastTimer = useRef(null);
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  function openOfferImageLightbox(offerCard) {
    const images = getOfferCardImages(offerCard);
    if (images.length === 0) return;
    setOfferImageLightbox({
      images,
      title: getOfferCardTitle(offerCard),
      index: 0,
    });
  }

  function openFeedImageLightbox(feedItem) {
    const images = getFeedItemGallery(feedItem);
    if (images.length === 0) return;
    setOfferImageLightbox({
      images,
      title: String(feedItem?.name || "Produto").trim(),
      index: 0,
    });
  }

  function closeOfferImageLightbox() {
    setOfferImageLightbox(null);
  }

  function showActionToast(message, variant = "success", duration = 3200) {
    if (actionToastTimer.current) clearTimeout(actionToastTimer.current);
    setActionToast({ message, variant });
    actionToastTimer.current = setTimeout(() => {
      setActionToast(null);
      actionToastTimer.current = null;
    }, duration);
  }

  function clearPlaceholderTimer() {
    if (placeholderTimerRef.current) {
      clearTimeout(placeholderTimerRef.current);
      placeholderTimerRef.current = null;
    }
  }

  function stopPlaceholderAnimation() {
    placeholderActiveRef.current = false;
    clearPlaceholderTimer();
    if (inputRef.current) inputRef.current.placeholder = "";
    if (placeholderTextRef.current) placeholderTextRef.current.textContent = "";
  }

  function applyStaticPlaceholder() {
    const input = inputRef.current;
    if (!input) return;
    input.placeholder = PLACEHOLDER_PHRASES[0];
  }

  function startPlaceholderAnimation() {
    if (typeof window === "undefined") return;
    if (placeholderReducedMotionRef.current) {
      applyStaticPlaceholder();
      return;
    }
    if (placeholderActiveRef.current) return;
    if (inputRef.current?.value.trim()) return;
    if (document.activeElement === inputRef.current) return;

    placeholderActiveRef.current = true;
    if (inputRef.current) inputRef.current.placeholder = "";

    let phraseIdx = 0;
    let charIdx = 0;
    let phase = "typing";

    const schedule = (delay) => {
      clearPlaceholderTimer();
      placeholderTimerRef.current = setTimeout(tick, delay);
    };

    const tick = () => {
      if (!placeholderActiveRef.current) return;
      if (inputRef.current?.value.trim()) {
        stopPlaceholderAnimation();
        return;
      }
      if (document.activeElement === inputRef.current) {
        stopPlaceholderAnimation();
        return;
      }

      const phrase = PLACEHOLDER_PHRASES[phraseIdx];
      const textEl = placeholderTextRef.current;

      if (phase === "typing") {
        charIdx += 1;
        if (textEl) textEl.textContent = phrase.slice(0, charIdx);
        if (charIdx >= phrase.length) {
          phase = "hold";
          const typeMs = 40 * phrase.length;
          const clearMs = 22 * phrase.length;
          const holdMs = Math.max(180, PLACEHOLDER_CYCLE_MS - typeMs - clearMs - 90);
          schedule(holdMs);
          return;
        }
        schedule(40);
        return;
      }

      if (phase === "hold") {
        phase = "clearing";
        schedule(16);
        return;
      }

      charIdx -= 1;
      if (textEl) textEl.textContent = phrase.slice(0, charIdx);
      if (charIdx <= 0) {
        phraseIdx = (phraseIdx + 1) % PLACEHOLDER_PHRASES.length;
        phase = "typing";
        schedule(90);
        return;
      }
      schedule(24);
    };

    if (placeholderTextRef.current) placeholderTextRef.current.textContent = "";
    schedule(120);
  }

  function scrollPageToChat() {
    if (typeof window === "undefined") return;
    if (window.scrollY > 80) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function bumpKeyboardComposer() {
    if (typeof window === "undefined") return;

    applyKeyboardMetricsRef.current();

    requestAnimationFrame(() => applyKeyboardMetricsRef.current());

    [16, 48, 96, 180, 320].forEach((delay) => {
      window.setTimeout(() => applyKeyboardMetricsRef.current(), delay);
    });
  }

  function resetKeyboardComposer() {
    if (typeof window === "undefined") return;

    keyboardOpenRef.current = false;
    chatRootRef.current?.classList.remove("mia-chat-root--keyboard-open");
    document.documentElement.style.setProperty("--mia-keyboard-offset", "0px");
  }

  function handleInputFocus() {
    inputFocusedRef.current = true;
    stopPlaceholderAnimation();
    bumpKeyboardComposer();
  }

  function handleInputBlur() {
    if (typeof window === "undefined") return;

    window.setTimeout(() => {
      if (inputRef.current && document.activeElement === inputRef.current) return;
      if (document.activeElement?.closest?.(".mia-chat-footer")) return;

      inputFocusedRef.current = false;

      const vv = window.visualViewport;
      const measured = vv
        ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        : 0;

      if (measured > 80 && document.activeElement?.tagName === "INPUT") {
        applyKeyboardMetricsRef.current();
        return;
      }

      resetKeyboardComposer();

      if (!inputRef.current?.value.trim()) {
        startPlaceholderAnimation();
      }
    }, 120);
  }

  function closeSideMenu() {
    setSideMenuOpen(false);
  }

  function closeAllHubPanels() {
    setFavoritesPanelOpen(false);
    setAlertsPanelOpen(false);
    setProfilePanelOpen(false);
    setProfileEditPanelOpen(false);
    setSettingsPanelOpen(false);
    setHelpPanelOpen(false);
    setHowItWorksPanelOpen(false);
    setFeedPanelOpen(false);
    setHistoryPanelOpen(false);
  }

  function closeProfileEditPanel() {
    setProfileEditPanelOpen(false);
  }

  function closeHubPanelFromDrawer() {
    if (profileEditPanelOpenRef.current) {
      closeProfileEditPanel();
      return;
    }
    closeAllHubPanels();
    if (panelReturnToMenuRef.current) {
      panelReturnToMenuRef.current = false;
      setSideMenuOpen(true);
    }
  }

  const hubPanelOpen = favoritesPanelOpen
    || alertsPanelOpen
    || profilePanelOpen
    || profileEditPanelOpen
    || settingsPanelOpen
    || helpPanelOpen
    || howItWorksPanelOpen
    || feedPanelOpen
    || historyPanelOpen;

  function openSideMenu() {
    setFavoritesPanelOpen(false);
    setAlertsPanelOpen(false);
    setProfilePanelOpen(false);
    setSettingsPanelOpen(false);
    setHelpPanelOpen(false);
    setHowItWorksPanelOpen(false);
    setFeedPanelOpen(false);
    setHistoryPanelOpen(false);
    setSideMenuOpen(true);
  }

  function toggleSideMenu() {
    setSideMenuOpen((open) => {
      if (!open) {
        setFavoritesPanelOpen(false);
        setAlertsPanelOpen(false);
        setProfilePanelOpen(false);
        setSettingsPanelOpen(false);
        setHelpPanelOpen(false);
        setHowItWorksPanelOpen(false);
        setFeedPanelOpen(false);
        setHistoryPanelOpen(false);
      }
      return !open;
    });
  }

  function handleDrawerAction(action) {
    closeSideMenu();
    if (action === "chat") {
      panelReturnToMenuRef.current = false;
      closeAllHubPanels();
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    panelReturnToMenuRef.current = true;
    if (action === "feed") {
      setFavoritesPanelOpen(false);
      setAlertsPanelOpen(false);
      setProfilePanelOpen(false);
      setSettingsPanelOpen(false);
      setHelpPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setHistoryPanelOpen(false);
      setFeedPanelOpen(true);
      return;
    }
    if (action === "how-it-works") {
      setFavoritesPanelOpen(false);
      setAlertsPanelOpen(false);
      setProfilePanelOpen(false);
      setSettingsPanelOpen(false);
      setHelpPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(false);
      setHowItWorksPanelOpen(true);
      return;
    }
    if (action === "favorites") {
      setAlertsPanelOpen(false);
      setProfilePanelOpen(false);
      setSettingsPanelOpen(false);
      setHelpPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(false);
      setFavoritesPanelOpen(true);
      return;
    }
    if (action === "history") {
      setAlertsPanelOpen(false);
      setProfilePanelOpen(false);
      setSettingsPanelOpen(false);
      setHelpPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(true);
      return;
    }
    if (action === "alerts") {
      setFavoritesPanelOpen(false);
      setProfilePanelOpen(false);
      setSettingsPanelOpen(false);
      setHelpPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(false);
      setAlertsPanelOpen(true);
      return;
    }
    if (action === "profile") {
      setFavoritesPanelOpen(false);
      setAlertsPanelOpen(false);
      setSettingsPanelOpen(false);
      setHelpPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(false);
      setProfilePanelOpen(true);
      return;
    }
    if (action === "settings") {
      setFavoritesPanelOpen(false);
      setAlertsPanelOpen(false);
      setProfilePanelOpen(false);
      setHelpPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(false);
      setSettingsPanelOpen(true);
      return;
    }
    if (action === "help") {
      setFavoritesPanelOpen(false);
      setAlertsPanelOpen(false);
      setProfilePanelOpen(false);
      setSettingsPanelOpen(false);
      setHowItWorksPanelOpen(false);
      setFeedPanelOpen(false);
      setHistoryPanelOpen(false);
      setHelpPanelOpen(true);
      return;
    }
  }

  const drawerUserName = userProfile.displayName?.trim()
    || user?.nome?.trim()
    || (user?.email ? user.email.split("@")[0] : "")
    || "Visitante";
  const drawerUserFirstName = drawerUserName.split(/\s+/)[0] || drawerUserName;
  const drawerUserSub = user?.email?.trim()
    ? (userProfile.displayName?.trim() || user?.nome?.trim()
      ? `Conta de ${drawerUserName}`
      : user.email.trim())
    : "Faça login para salvar favoritos e personalizar sua experiência.";

  function buildApiSessionContext(base = sessionContext) {
    const name = userProfile.displayName?.trim() || user?.nome?.trim() || "";
    if (!name) return base;
    return { ...base, user_display_name: name };
  }

  function closeLoginPopup() {
    setShowLoginPopup(false);
    setPendingAction(null);
  }

  function scrollToAlertsCreateForm() {
    if (typeof document === "undefined") return;
    document.getElementById("mia-alerts-create-title")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleStartFirstAlert() {
    if (!user) {
      setPendingAction({ type: "create-alert" });
      setShowLoginPopup(true);
      return;
    }
    scrollToAlertsCreateForm();
  }

  useEffect(() => {
    setHasMounted(true);
    const storedUser = loadStoredUser();
    if (storedUser) setUser(storedUser);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setUserProfile({ displayName: "", photoDataUrl: "" });
      return;
    }
    const storedProfile = loadUserProfile(user.id);
    const displayName = storedProfile.displayName || String(user.nome || "").trim();
    const nextProfile = {
      displayName,
      photoDataUrl: storedProfile.photoDataUrl || "",
    };
    setUserProfile(nextProfile);
    if (displayName && displayName !== storedProfile.displayName) {
      saveUserProfile(user.id, nextProfile);
    }
  }, [user?.id, user?.nome]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    function scrollFocusedFieldIntoView(target) {
      const vv = window.visualViewport;
      const viewportBottom = vv
        ? vv.offsetTop + vv.height
        : window.innerHeight;
      const rect = target.getBoundingClientRect();
      const hidden = rect.bottom > viewportBottom - 20 || rect.top < (vv?.offsetTop || 0) + 12;

      if (hidden) {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }

      if (target.closest(".mia-chat-footer")) {
        handleInputFocus();
      }
    }

    function handleEditableFocus(event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select")) return;
      if (!target.closest(".mia-hub-panel, .mia-drawer, .mia-login-card, .mia-chat-footer")) return;

      scrollFocusedFieldIntoView(target);
      window.setTimeout(() => scrollFocusedFieldIntoView(target), 280);
      window.setTimeout(() => scrollFocusedFieldIntoView(target), 520);
    }

    document.addEventListener("focusin", handleEditableFocus);
    return () => document.removeEventListener("focusin", handleEditableFocus);
  }, []);

  useEffect(() => {
    if (!showLoginPopup || typeof document === "undefined") return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [showLoginPopup]);

  useEffect(() => {
    sideMenuOpenRef.current = sideMenuOpen;
  }, [sideMenuOpen]);

  useEffect(() => {
    hubPanelOpenRef.current = hubPanelOpen;
  }, [hubPanelOpen]);

  useEffect(() => {
    profileEditPanelOpenRef.current = profileEditPanelOpen;
  }, [profileEditPanelOpen]);

  useEffect(() => {
    offerImageLightboxRef.current = offerImageLightbox;
  }, [offerImageLightbox]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const MIA_NAV_STATE = "mia-app-overlay";

    function pushMiaNavLayer() {
      window.history.pushState({ [MIA_NAV_STATE]: true, t: Date.now() }, "");
    }

    function popMiaNavLayer() {
      miaNavProgrammaticRef.current = true;
      window.history.back();
    }

    function onPopState() {
      if (miaNavProgrammaticRef.current) {
        miaNavProgrammaticRef.current = false;
        return;
      }

      miaNavFromPopstateRef.current = true;

      if (offerImageLightboxRef.current) {
        setOfferImageLightbox(null);
        return;
      }
      if (profileEditPanelOpenRef.current) {
        setProfileEditPanelOpen(false);
        return;
      }
      if (hubPanelOpenRef.current) {
        closeHubPanelFromDrawer();
        return;
      }
      if (sideMenuOpenRef.current) {
        setSideMenuOpen(false);
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const overlayCount =
      (offerImageLightbox ? 1 : 0) +
      (hubPanelOpen ? 1 : 0) +
      (sideMenuOpen ? 1 : 0);

    if (miaNavFromPopstateRef.current) {
      miaNavFromPopstateRef.current = false;
      prevOverlayCountRef.current = overlayCount;
      return undefined;
    }

    const prev = prevOverlayCountRef.current;

    if (overlayCount > prev) {
      for (let index = prev; index < overlayCount; index += 1) {
        window.history.pushState({ "mia-app-overlay": true, t: Date.now() }, "");
      }
    } else if (overlayCount < prev) {
      for (let index = overlayCount; index < prev; index += 1) {
        miaNavProgrammaticRef.current = true;
        window.history.back();
      }
    }

    prevOverlayCountRef.current = overlayCount;
    return undefined;
  }, [offerImageLightbox, hubPanelOpen, sideMenuOpen]);

  useEffect(() => {
    blockSwipeRef.current = showLoginPopup || !!offerImageLightbox;
  }, [showLoginPopup, offerImageLightbox]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("mia-hub-panel-open", hubPanelOpen);
    return () => document.body.classList.remove("mia-hub-panel-open");
  }, [hubPanelOpen]);

  useEffect(() => {
    if (!hubPanelOpen || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeHubPanelFromDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hubPanelOpen]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("mia-app-drawer-open", sideMenuOpen);
    return () => document.body.classList.remove("mia-app-drawer-open");
  }, [sideMenuOpen]);

  useEffect(() => {
    if (!sideMenuOpen || typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeSideMenu();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sideMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    const MIN_SWIPE = 56;
    const INTERACTIVE_SELECTOR = "input, textarea, button, a, select, label";

    function isInteractiveTarget(target) {
      return target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR));
    }

    function onTouchStart(event) {
      if (blockSwipeRef.current) return;
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (isInteractiveTarget(event.target)) return;
      if (event.target instanceof Element && event.target.closest(".mia-image-lightbox-root")) return;

      drawerSwipeRef.current = {
        tracking: true,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    }

    function onTouchEnd(event) {
      if (blockSwipeRef.current) return;

      const swipe = drawerSwipeRef.current;
      if (!swipe.tracking) return;
      swipe.tracking = false;

      const touch = event.changedTouches[0];
      if (!touch) return;

      const deltaX = touch.clientX - swipe.startX;
      const deltaY = touch.clientY - swipe.startY;
      if (Math.abs(deltaY) >= Math.abs(deltaX)) return;
      if (Math.abs(deltaX) < MIN_SWIPE) return;

      const menuOpen = sideMenuOpenRef.current;
      const panelOpen = hubPanelOpenRef.current;

      if (deltaX < 0) {
        if (menuOpen) {
          closeSideMenu();
          return;
        }
        if (panelOpen) {
          closeHubPanelFromDrawer();
        }
        return;
      }

      if (deltaX > 0 && !menuOpen && !panelOpen) {
        openSideMenu();
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

useEffect(() => {
  if (typeof window === "undefined") return;
  let storedId = localStorage.getItem("mia_conversation_id");

  if (!storedId) {
    storedId = `mia-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem("mia_conversation_id", storedId);
  }

  conversationIdRef.current = storedId;
}, []);

     async function processImageFile(file, source = "gallery") {
    const validation = validateImageFile(file);
    if (!validation.ok) {
      showActionToast(validation.error, "error");
      return;
    }

    try {
      const { dataUrl, width, height, mime } = await readImageFileAsDataUrl(file);
      setSelectedImageBase64(dataUrl);
      setSelectedImagePreview(dataUrl);
      setImageAttachmentMeta({
        fileName: file.name || "imagem",
        fileType: mime || file.type,
        fileSize: file.size,
        width,
        height,
        source,
      });
    } catch (_) {
      showActionToast("Não consegui ler essa imagem. Tente outra.", "error");
    }
  }

  function handleImageInputChange(event, source) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    processImageFile(file, source);
  }

  function removeSelectedImage() {
    setSelectedImageBase64("");
    setSelectedImagePreview("");
    setImageAttachmentMeta(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  }

  function replaceSelectedImage() {
    galleryInputRef.current?.click();
  }

  async function submitImageForAnalysis() {
    if (!selectedImageBase64 || imageAnalysisLoading || loading) return;

    const userText = msg.trim();
    const imagePreview = selectedImagePreview;
    const imageBase64 = selectedImageBase64;
    const metadata = imageAttachmentMeta || {};

    setMsg("");
    removeSelectedImage();

    const currentRequestId = ++requestIdRef.current;

    setHistory((prev) => [
      ...prev,
      {
        pergunta: userText,
        imagePreview,
        resposta: null,
        price: null,
        offerCard: null,
        turnId: currentRequestId,
      },
    ]);

    setHistory((prev) => [
      ...prev,
      {
        assistantTemp: true,
        loadingKind: "image-analysis",
        resposta: null,
        price: null,
        offerCard: null,
        turnId: currentRequestId,
      },
    ]);

    setImageAnalysisLoading(true);
    setTyping(true);

    try {
      const result = await requestImageAnalysis({
        imageBase64,
        text: userText,
        metadata,
      });

      if (currentRequestId !== requestIdRef.current) return;

      setHistory((prev) =>
        prev.map((item) => {
          if (item.turnId !== currentRequestId || !item.assistantTemp) return item;
          return {
            ...item,
            assistantTemp: false,
            loadingKind: undefined,
            resposta: result.message,
          };
        })
      );
    } catch (_) {
      if (currentRequestId === requestIdRef.current) {
        showActionToast("Não consegui analisar a imagem agora. Tente novamente.", "error");
        setHistory((prev) =>
          prev.filter((item) => item.turnId !== currentRequestId || !item.assistantTemp)
        );
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setImageAnalysisLoading(false);
        setTyping(false);
      }
    }
  }

  async function toggleVoz() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showActionToast("Seu navegador não suporta voz. Tente Chrome no celular.", "error");
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch (_) {
        /* noop */
      }
      setIsListening(false);
      return;
    }

    const startRecognition = () => {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.continuous = true;

      speechBaseMsgRef.current = msg.trim();
      speechTranscriptRef.current = "";

      recognition.onstart = () => setIsListening(true);
      recognition.onerror = (event) => {
        setIsListening(false);
        const code = event?.error || "";
        if (code === "not-allowed" || code === "service-not-allowed") {
          showActionToast("Permita o microfone para falar com a MIΛ.", "error");
          return;
        }
        if (code === "no-speech") {
          showActionToast("Não ouvi nada. Toque no microfone e tente de novo.", "neutral");
          return;
        }
        if (code !== "aborted") {
          showActionToast("Não consegui captar a voz. Tente novamente.", "error");
        }
      };
      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        const spoken = speechTranscriptRef.current.trim();
        if (spoken) {
          const prefix = speechBaseMsgRef.current;
          setMsg(prefix ? `${prefix} ${spoken}` : spoken);
        }
      };
      recognition.onresult = (event) => {
        let interim = "";
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || "";
          if (event.results[i].isFinal) {
            finalText += piece;
          } else {
            interim += piece;
          }
        }
        if (finalText) {
          speechTranscriptRef.current += finalText;
        }
        const combined = `${speechTranscriptRef.current}${interim}`.trim();
        const prefix = speechBaseMsgRef.current;
        setMsg(combined ? (prefix ? `${prefix} ${combined}` : combined) : prefix);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch (_) {
        setIsListening(false);
        showActionToast("Não foi possível iniciar a gravação. Tente de novo.", "error");
      }
    };

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        startRecognition();
      } catch (_) {
        showActionToast("Permita o microfone para falar com a MIΛ.", "error");
      }
      return;
    }

    startRecognition();
  }

  function resetCognitiveLoading(seed = "") {
    setCognitiveLoading(getCognitiveLoadingFallbackState(seed));
  }

  function abortCognitiveLoadingPreview() {
    if (cognitiveLoadingAbortRef.current) {
      cognitiveLoadingAbortRef.current.abort();
      cognitiveLoadingAbortRef.current = null;
    }
  }

  async function refreshCognitiveLoadingPreview(text, sessionCtx, requestId) {
    abortCognitiveLoadingPreview();
    const controller = new AbortController();
    cognitiveLoadingAbortRef.current = controller;

    try {
      const resp = await fetch("/api/mia-cognitive-loading", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": MIA_API_KEY,
        },
        body: JSON.stringify({
          text: text || "",
          session_context: buildApiSessionContext(sessionCtx),
        }),
        signal: controller.signal,
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (requestIdRef.current !== requestId) return;
      if (data?.description) {
        setCognitiveLoading(data);
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }

  const followUps = [
    "Quer comparar com outro modelo? 💜",
    "Prefere ver opções mais baratas? 😎",
    "Se quiser, posso achar alternativas melhores 😉",
    "Quer que eu ache um custo-benefício top? 🔍",
    "Posso monitorar outros preços pra você! 🔔"
  ];

  const MIA_API_KEY = "minha_chave_181199";

  function mapWishToFavorite(wish = {}) {
    return {
      id: wish.id || `fav-${Date.now()}`,
      product_name: wish.product_name || "Produto",
      price: wish.price ?? wish.last_price ?? "",
      link: wish.product_url || wish.link || "",
      thumbnail: wish.thumbnail || wish.product_thumbnail || "",
      source: wish.source || wish.store || "",
      created_at: wish.created_at || wish.updated_at || null,
    };
  }

  function mapAlertFromApi(alert = {}) {
    return {
      id: alert.id || `alert-${Date.now()}`,
      product_name: alert.product_name || "Produto",
      link: alert.product_url || alert.link || "",
      thumbnail: alert.product_thumbnail || alert.thumbnail || "",
      source: alert.source || "",
      current_price: alert.current_price ?? alert.last_checked_price ?? null,
      target_price: alert.target_price ?? null,
      created_at: alert.created_at || null,
    };
  }

  function getAlertsStorageKey(userId) {
    return `mia_price_alerts_${userId}`;
  }

  function persistAlerts(userId, alerts) {
    if (!userId || typeof window === "undefined") return;
    try {
      localStorage.setItem(getAlertsStorageKey(userId), JSON.stringify(alerts));
    } catch (_) {
      /* noop */
    }
  }

  function loadAlertsFromStorage(userId) {
    if (!userId || typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(getAlertsStorageKey(userId));
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function upsertAlert(alertRow, userId) {
    const mapped = mapAlertFromApi(alertRow);
    setWatches((prev) => {
      const withoutDuplicate = prev.filter(
        (item) => getProductIdentityKey(item) !== getProductIdentityKey(mapped)
      );
      const next = [mapped, ...withoutDuplicate.filter((item) => item.id !== mapped.id)];
      if (userId) persistAlerts(userId, next);
      return next;
    });
    return mapped;
  }

  function parseAlertPriceInput(value) {
    if (value == null || value === "") return null;
    const normalized = String(value)
      .replace(/[^\d,.-]/g, "")
      .replace(/\.(?=\d{3}(\D|$))/g, "")
      .replace(",", ".");
    const num = parseFloat(normalized);
    return Number.isNaN(num) ? null : num;
  }

  function scrollToChatFromPanel() {
    panelReturnToMenuRef.current = false;
    closeAllHubPanels();
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 420);
  }

  function handleHelpSupportSubmit(result = {}) {
    if (result.error) {
      showActionToast(result.error, "error");
      return;
    }
    if (result.success) {
      showActionToast("Abrimos seu app de email para enviar a mensagem.", "success");
    }
  }

  function openFavoritesFromAlerts() {
    setAlertsPanelOpen(false);
    setFavoritesPanelOpen(true);
  }

  function openAlertsFromProfile() {
    setProfilePanelOpen(false);
    setAlertsPanelOpen(true);
  }

  function openFavoritesFromProfile() {
    setProfilePanelOpen(false);
    setFavoritesPanelOpen(true);
  }

  function handleEditProfile() {
    if (!user) {
      setPendingAction({ type: "account" });
      setShowLoginPopup(true);
      return;
    }
    setProfileEditPanelOpen(true);
  }

  function handleSaveProfileEdit(profileData = {}) {
    if (!user?.id) return;

    const nextProfile = {
      displayName: String(profileData.displayName || "").trim(),
      photoDataUrl: String(profileData.photoDataUrl || "").trim(),
    };

    saveUserProfile(user.id, nextProfile);
    setUserProfile(nextProfile);

    if (nextProfile.displayName) {
      const nextUser = { ...user, nome: nextProfile.displayName };
      setUser(nextUser);
      saveStoredUser(nextUser);
    }

    setProfileEditPanelOpen(false);
    showActionToast("Perfil atualizado com sucesso.", "success");
  }

  function handleRemoveAlert(alert) {
    if (!alert?.id || !user?.id) return;
    if (actionBusy) return;

    setActionBusy(`remove-alert-${alert.id}`);

    try {
      setWatches((prev) => {
        const next = prev.filter((item) => item.id !== alert.id);
        persistAlerts(user.id, next);
        return next;
      });
      showActionToast("Monitoramento removido.", "success");
    } finally {
      setActionBusy(null);
    }
  }

  function handleAskMiaAboutAlertProduct(product) {
    handleAskMiaAboutFeedProduct(product);
  }

  async function handleClearLocalCache() {
    if (actionBusy === "clear-cache") return;
    setActionBusy("clear-cache");

    try {
      if (typeof window !== "undefined") {
        const preservedKeys = new Set(["mia_preferences"]);
        const keysToRemove = [];

        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index);
          if (!key || !key.startsWith("mia_")) continue;
          if (preservedKeys.has(key) || key.startsWith("mia_price_alerts_")) continue;
          keysToRemove.push(key);
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));

        clearSessionOpeningState();

        const nextConversationId = `conv-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        localStorage.setItem("mia_conversation_id", nextConversationId);
        conversationIdRef.current = nextConversationId;
      }

      showActionToast("Cache local limpo com sucesso.", "success");
    } catch (error) {
      console.error("Erro ao limpar cache local:", error);
      showActionToast("Não foi possível limpar o cache agora.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  function computeProfileMetrics() {
    const conversations = history.filter((item) => {
      const question = item?.pergunta;
      return question && String(question).trim() && !item?.assistantTemp;
    }).length;
    const productsAnalyzed = history.filter((item) => item?.offerCard).length;

    return {
      productsAnalyzed,
      favorites: favorites.length,
      alerts: watches.length,
      conversations,
    };
  }

  function handleAskMiaAboutFeedProduct(product) {
    const name = String(product?.product_name || product?.title || "este produto").trim();
    const message =
      `Quero saber mais sobre o produto ${name}. Me explique se ele faz sentido para mim, os pontos fortes e os cuidados antes de comprar.`;

    setFavoritesPanelOpen(false);
    setAlertsPanelOpen(false);
    setFeedPanelOpen(false);

    if (typeof window === "undefined") return;

    if (inputRef.current instanceof HTMLElement) {
      inputRef.current.blur();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });

    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("mia-suggestion", { detail: message }));
    }, 280);
  }

  function handleAskMiaAboutFavorite(favorite) {
    const name = String(favorite?.product_name || "este produto").trim();
    setFavoritesPanelOpen(false);
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    window.setTimeout(() => {
      setMsg(`Quero saber mais sobre ${name}. Vale a pena?`);
      inputRef.current?.focus({ preventScroll: true });
    }, 420);
  }

  async function handleRemoveFavorite(favorite) {
    if (!favorite?.id) return;
    if (actionBusy) return;

    if (!user?.id) {
      showActionToast("Entre com seu email para gerenciar favoritos.", "neutral");
      return;
    }

    setActionBusy(`remove-${favorite.id}`);

    try {
      const resp = await fetch("/api/delete-wish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": MIA_API_KEY,
        },
        body: JSON.stringify({
          id: favorite.id,
          user_id: user.id,
        }),
      });

      const data = await resp.json();

      if (resp.ok && data.success) {
        setFavorites((prev) => prev.filter((item) => item.id !== favorite.id));
        showActionToast("Favorito removido.", "success");
      } else {
        showActionToast("Não consegui remover agora. Tente de novo.", "error");
      }
    } catch (_) {
      showActionToast("Erro ao remover. Verifique sua conexão.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/list-wish?user_id=${encodeURIComponent(user.id)}`, {
        headers: { "x-api-key": MIA_API_KEY }
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.success) {
            setFavorites((data.wishes || []).map(mapWishToFavorite));
          }
        })
        .catch(console.error);

      setWatches(loadAlertsFromStorage(user.id));
    } else {
      setWatches([]);
    }
  }, [user]);

  useEffect(() => {
    if (!hasMounted || greetingShown) return undefined;

    const storedOpening = resolveStoredSessionOpening();
    if (storedOpening) {
      setHistory([buildOpeningHistoryEntry(storedOpening)]);
      setGreetingShown(true);
      setOpeningTyping(false);
      return undefined;
    }

    setOpeningTyping(true);
    let cancelled = false;

    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const opening = buildMiaOpening();
      setOpeningTyping(false);
      setHistory([buildOpeningHistoryEntry(opening)]);
      setGreetingShown(true);
    }, getOpeningTypingDelayMs());

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasMounted, greetingShown]);

  function scrollToCurrentMiaFocus(behavior = "smooth") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const messagesEl = scrollRef.current;
        if (!messagesEl) return;

        const loadingBubble = messagesEl.querySelector(".mia-msg-loading--active");
        const bodyEls = messagesEl.querySelectorAll(".mia-msg-body");
        const lastBody = bodyEls.length ? bodyEls[bodyEls.length - 1] : null;

        let target = null;
        if (loadingBubble) {
          target = loadingBubble;
        } else if (lastBody) {
          target = lastBody;
        }

        if (!target) return;

        const containerRect = messagesEl.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offsetTop =
          messagesEl.scrollTop + (targetRect.top - containerRect.top) - 10;
        const maxScroll = Math.max(0, messagesEl.scrollHeight - messagesEl.clientHeight);

        messagesEl.scrollTo({
          top: Math.min(maxScroll, Math.max(0, offsetTop)),
          behavior
        });
      });
    });
  }

  useEffect(() => {
    if (typeof window === "undefined" || !footerRef.current) return undefined;

    const footer = footerRef.current;
    let lastHeight = 0;
    let resizeTimer = null;

    const updateFooterHeight = () => {
      if (!footerRef.current) return;
      const height = Math.ceil(footerRef.current.getBoundingClientRect().height);
      if (height < 48) return;
      if (Math.abs(height - lastHeight) <= 1) return;
      lastHeight = height;
      document.documentElement.style.setProperty("--mia-footer-height", `${height}px`);
    };

    const scheduleFooterMeasure = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        updateFooterHeight();
      }, 120);
    };

    updateFooterHeight();
    window.addEventListener("resize", scheduleFooterMeasure);
    window.addEventListener("orientationchange", scheduleFooterMeasure);

    let observer;
    const useResizeObserver = typeof ResizeObserver !== "undefined"
      && !window.matchMedia("(max-width: 640px)").matches;

    if (useResizeObserver) {
      observer = new ResizeObserver(scheduleFooterMeasure);
      observer.observe(footer);
    }

    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener("resize", scheduleFooterMeasure);
      window.removeEventListener("orientationchange", scheduleFooterMeasure);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined;

    const applyKeyboardMetrics = () => {
      const vv = window.visualViewport;
      if (!vv) return;

      if (!inputFocusedRef.current) {
        if (keyboardOpenRef.current) {
          keyboardOpenRef.current = false;
          chatRootRef.current?.classList.remove("mia-chat-root--keyboard-open");
          document.documentElement.style.setProperty("--mia-keyboard-offset", "0px");
        }
        return;
      }

      const offset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      const keyboardVisible = offset > 80;

      if (keyboardVisible) {
        keyboardOpenRef.current = true;
        document.documentElement.style.setProperty("--mia-keyboard-offset", `${offset}px`);
        chatRootRef.current?.classList.add("mia-chat-root--keyboard-open");
        return;
      }

      keyboardOpenRef.current = false;
      chatRootRef.current?.classList.remove("mia-chat-root--keyboard-open");
      document.documentElement.style.setProperty("--mia-keyboard-offset", "0px");
    };

    applyKeyboardMetricsRef.current = applyKeyboardMetrics;

    const scheduleKeyboardUpdate = () => {
      if (keyboardRafRef.current) return;
      keyboardRafRef.current = requestAnimationFrame(() => {
        keyboardRafRef.current = null;
        applyKeyboardMetrics();
      });
    };

    applyKeyboardMetrics();
    window.visualViewport.addEventListener("resize", scheduleKeyboardUpdate);

    return () => {
      if (keyboardRafRef.current) cancelAnimationFrame(keyboardRafRef.current);
      window.visualViewport?.removeEventListener("resize", scheduleKeyboardUpdate);
      applyKeyboardMetricsRef.current = () => {};
      document.documentElement.style.removeProperty("--mia-keyboard-offset");
      keyboardOpenRef.current = false;
      chatRootRef.current?.classList.remove("mia-chat-root--keyboard-open");
    };
  }, []);

  useEffect(() => {
    const behavior = typing || loading || imageAnalysisLoading ? "auto" : "smooth";
    scrollToCurrentMiaFocus(behavior);
  }, [history, typing, loading, revealText, imageAnalysisLoading]);

  useEffect(() => {
    if (!hasMounted) return undefined;

    placeholderReducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    startPlaceholderAnimation();

    return () => {
      stopPlaceholderAnimation();
    };
  }, [hasMounted]);

  useEffect(() => {
    if (msg.trim()) {
      stopPlaceholderAnimation();
      return;
    }
    if (hasMounted && document.activeElement !== inputRef.current) {
      startPlaceholderAnimation();
    }
  }, [msg, hasMounted]);

  function formatPrice(price) {
    if (price == null || price === "") return "Preço indisponível";

    if (typeof price === "number" && !Number.isNaN(price)) {
      return price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    }

    const priceStr = String(price).trim();
    if (!priceStr) return "Preço indisponível";

    let raw = priceStr.replace(/^R\s?\$\s?/i, "").trim();
    let num;

    if (/,\d{1,2}$/.test(raw)) {
      num = parseFloat(raw.replace(/\./g, "").replace(",", "."));
    } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
      num = parseFloat(raw.replace(/\./g, ""));
    } else if (/^\d+\.\d{1,2}$/.test(raw)) {
      num = parseFloat(raw);
    } else {
      const digits = raw.replace(/[^\d.,]/g, "");
      if (!digits) return "Preço indisponível";
      num = parseFloat(digits.replace(/\./g, "").replace(",", "."));
    }

    if (Number.isNaN(num)) return "Preço indisponível";

    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function offerCardPriceIsUnavailable(price) {
    return formatPrice(price) === "Preço indisponível";
  }

  function isObscureStoreSource(source) {
    const s = String(source || "").trim();
    if (!s) return true;

    if (/\.(com|br|net|org|shop|store)(\.|$)/i.test(s)) return true;
    if (s.length > 28) return true;
    if (/\b(european|transactions|international|wholesale|marketplace|llc|ltd|inc)\b/i.test(s)) return true;
    if (/bludiode|jufap|mibrasil/i.test(s)) return true;

    return false;
  }

  function formatStoreDisplay(source) {
    const fallback = {
      primary: "Oferta encontrada",
      secondary: "via Google Shopping",
      isFallback: true,
    };

    if (!source || typeof source !== "string") return fallback;

    const raw = source.trim();
    if (!raw) return fallback;

    const lower = raw.toLowerCase();

    if (/amazon/.test(lower)) return { primary: "Amazon", secondary: null, isFallback: false };
    if (/mercado\s*livre/.test(lower)) return { primary: "Mercado Livre", secondary: null, isFallback: false };
    if (/kabum/.test(lower)) return { primary: "KaBuM!", secondary: null, isFallback: false };
    if (/magalu/.test(lower)) return { primary: "Magalu", secondary: null, isFallback: false };
    if (/carrefour/.test(lower)) return { primary: "Carrefour", secondary: null, isFallback: false };
    if (/casas\s*bahia/.test(lower)) return { primary: "Casas Bahia", secondary: null, isFallback: false };
    if (/data layer mia|query_product_anchor/i.test(lower)) {
      return { primary: "Data Layer MIA", secondary: null, isFallback: false };
    }

    if (isObscureStoreSource(raw)) return fallback;

    return { primary: raw, secondary: null, isFallback: false };
  }

  function parsePriceValue(p) {
    if (!p) return Number.POSITIVE_INFINITY;
    try {
      if (typeof p === "number") return p;
      const s = String(p).replace(/[^0-9.,]/g, "").replace(",", ".");
      const num = parseFloat(s);
      return isNaN(num) ? Number.POSITIVE_INFINITY : num;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function startReveal(text) {
    setRevealText("");
    if (revealInterval.current) clearInterval(revealInterval.current);
    let i = 0;
    revealInterval.current = setInterval(() => {
      i++;
      setRevealText(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(revealInterval.current);
        revealInterval.current = null;
      }
    }, 12);
  }

  function sanitizeTextNoUrls(t) {
    if (!t) return "";
    return t.replace(/https?:\/\/\S+/gi, "").replace(/www\.\S+/gi, "").trim();
  }

  function extractApiReply(data) {
    if (!data || typeof data !== "object") {
      return "⚠️ Não consegui responder agora. Tente perguntar de outro jeito.";
    }
    const raw = data.reply ?? data.answer ?? data.message ?? data.response ?? data.text ?? "";
    const text = typeof raw === "string" ? raw.trim() : String(raw ?? "").trim();
    return text || "⚠️ Não consegui responder agora. Tente perguntar de outro jeito.";
  }

  function extractApiProducts(data) {
    if (!data || typeof data !== "object") return [];
    const raw = data.products ?? data.prices ?? data.items ?? [];
    return Array.isArray(raw) ? raw : [];
  }

  const COMMERCIAL_FALLBACK_DISPLAY_REPLY =
    "Encontrei uma oferta real via Google Shopping.\nEsse item ainda não tem análise completa da MIΛ.\n\nUse como referência de preço.";

  function isCommercialFallbackReply(text = "") {
    const t = String(text || "");
    return (
      /Encontrei uma oferta real/i.test(t) &&
      /Google Shopping/i.test(t) &&
      (/catálogo técnico da MIA|catalogo tecnico da mia/i.test(t) ||
        /não como recomendação profunda|nao como recomendacao profunda/i.test(t))
    );
  }

  function resolveCommercialFallbackFlag(data = {}) {
    return !!(
      data.mia_debug?.commercialOnlyFallback ||
      data.session_context?.lastBehaviorMode === "commercial_offer" ||
      data.session_context?.lastInteractionType === "commercial_fallback"
    );
  }

  function formatAssistantReplyForDisplay(text = "", { commercialFallback = false } = {}) {
    const raw = String(text || "").trim();
    if (raw) return raw;
    if (commercialFallback) {
      return COMMERCIAL_FALLBACK_DISPLAY_REPLY;
    }
    return raw;
  }

  /** Mantida por segurança; não usada na bolha principal desde PATCH 3.9. */
  function compactReplyForCardDisplay(text = "") {
    const raw = String(text || "").trim();
    if (!raw) return "";

    if (isCommercialFallbackReply(raw) || raw === COMMERCIAL_FALLBACK_DISPLAY_REPLY) {
      return "✓ Oferta real via Google Shopping\n✓ Use como referência de preço";
    }

    const stripIntroLead = (s) =>
      s
        .replace(/^(pra (essa|esta|sua) busca[,:\s]+)/i, "")
        .replace(/^(para (essa|esta|sua) busca[,:\s]+)/i, "")
        .replace(/^(nesse caso[,:\s]+)/i, "")
        .replace(/^(considerando (sua|a) busca[,:\s]+)/i, "")
        .trim();

    const chunks = raw
      .split(/\n+/)
      .flatMap((line) => line.split(/(?<=[.!?])\s+|;\s+/))
      .flatMap((line) => line.split(/,\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ]|Tarefas|Excelente|Boa|Faz|Performance|Bateria)/))
      .map((s) => stripIntroLead(s.trim()))
      .filter(Boolean);

    const meaningful = chunks.filter((s) => s.length >= 12 && !/^https?:/i.test(s));
    const source = meaningful.length >= 2 ? meaningful : chunks.filter((s) => s.length >= 8);
    if (source.length <= 1 && raw.length < 160) return raw;

    return source.slice(0, 3).map((sentence) => {
      let line = sentence.replace(/^[-•*✓✔]\s*/, "").trim();
      line = line.replace(/^(ele |ela |este |esta |o produto |esse modelo |isso )/i, "");
      if (line.length > 46) {
        line = `${line.slice(0, 44).replace(/\s+\S*$/, "")}…`;
      }
      const capped = line.charAt(0).toUpperCase() + line.slice(1);
      return `✓ ${capped}`;
    }).join("\n");
  }

  function resolveAssistantBodyText(item, turnIndex, { typing, revealText, historyLength }) {
    const isLiveTurn = typing && revealText && turnIndex === historyLength - 1;
    const source = isLiveTurn ? revealText : item.resposta;
    // PATCH 3.9: resposta completa com card — não usar compactReplyForCardDisplay na bolha principal.
    return source || "";
  }

  function renderAssistantBodyContent(text = "") {
    const raw = String(text || "");
    if (!raw) return null;

    if (!shouldUseStructuredParagraphs(raw)) {
      return raw;
    }

    return splitAssistantParagraphs(raw).map((paragraph, index) => (
      <p key={`mia-paragraph-${index}`} className="mia-msg-paragraph">
        {paragraph}
      </p>
    ));
  }

  function isProductFavorited(prod) {
    return Boolean(findProductByIdentity(favorites, prod));
  }

  function isProductMonitored(prod) {
    return Boolean(findProductByIdentity(watches, prod));
  }

  function finishAssistantReveal(displayResponse, hasOfferCard, currentRequestId) {
    if (hasOfferCard) {
      if (requestIdRef.current !== currentRequestId) return;
      setTyping(false);
      setRevealText("");
      return;
    }
    startReveal(displayResponse);
    setTimeout(() => {
      if (requestIdRef.current !== currentRequestId) return;
      setTyping(false);
      setRevealText("");
    }, Math.max(600, Math.min(1200, displayResponse.length * 3)));
  }

  function buildAssistantHistoryEntry({
    resposta,
    cardProduct = null,
    commercialFallback = false,
    turnId = null
  } = {}) {
    const offerCard = cardProduct || null;
    return {
      pergunta: null,
      resposta,
      turnId,
      offerCard,
      price: offerCard,
      commercialFallback: !!commercialFallback
    };
  }

  function isOfferCardPlausibleForQuery(cardProduct, query = "") {
    if (!cardProduct) return false;

    const q = String(query || "").toLowerCase();
    const title = String(cardProduct.product_name || cardProduct.title || "").toLowerCase();
    if (!q || !title) return true;

    const chairQuery = /cadeira|ergonom|chair/.test(q);
    const audioQuery = /fone|headset|earbud|bluetooth|buds/.test(q);
    const notebookQuery = /notebook|laptop|macbook|vivobook|ideapad|core i[357]/.test(q);
    const phoneQuery = /celular|smartphone|iphone|galaxy|redmi|motorola|moto g|moto e/.test(q);

    if (chairQuery && !/cadeira|chair|ergonom|poltrona/.test(title)) return false;
    if (audioQuery && /notebook|laptop|cadeira|chair|monitor|celular|smartphone|iphone|galaxy/.test(title) && !/fone|headset|earbud|bluetooth|buds|airpods/.test(title)) {
      return false;
    }
    if (notebookQuery && /cadeira|chair|fone|headset|buds|celular|smartphone/.test(title) && !/notebook|laptop|macbook|vivobook|ideapad|core i[357]|ssd|ram/.test(title)) {
      return false;
    }
    if (phoneQuery && /notebook|laptop|cadeira|chair|monitor|fone|headset|buds/.test(title) && !/celular|smartphone|iphone|galaxy|redmi|motorola|moto |phone|android/.test(title)) {
      return false;
    }

    return true;
  }

  function resolveOfferCardForTurn(cardProduct, query = "") {
    if (!cardProduct) return null;
    return isOfferCardPlausibleForQuery(cardProduct, query) ? cardProduct : null;
  }

  // ✅ ETAPA A: monta histórico para enviar ao backend
  function buildMessagesForApi(baseHistory = [], currentUserText = "") {
    const msgs = [];

    for (const item of baseHistory) {
      if (item?.pergunta) {
        const userText = sanitizeTextNoUrls(item.pergunta);
        if (userText) msgs.push({ role: "user", content: userText });
      }

      if (item?.resposta && !item?.assistantTemp) {
        const botText = sanitizeTextNoUrls(item.resposta);
        if (botText) msgs.push({ role: "assistant", content: botText });
      }
    }

    const current = sanitizeTextNoUrls(currentUserText);
    if (current) msgs.push({ role: "user", content: current });

    return msgs.slice(-12);
  }

  // Listener para envio de sugestões clicáveis
  useEffect(() => {
    function handleSuggestion(e) {
      const texto = e.detail;
      if (!texto) return;

      const fakeEnviar = async () => {
        const pergunta = texto;
        setMsg("");
        if (revealInterval.current) clearInterval(revealInterval.current);
        setRevealText("");

        const currentRequestId = ++requestIdRef.current;

          setHistory((prev) => [
      ...prev,
      {
        pergunta: pergunta,
        imagePreview: "",
        resposta: null,
        price: null,
        offerCard: null,
        turnId: currentRequestId
      }
    ]);
        setHistory((prev) => [
          ...prev,
          { assistantTemp: true, resposta: null, price: null, offerCard: null, turnId: currentRequestId }
        ]);

        setLoading(true);
        setTyping(true);
        resetCognitiveLoading(pergunta);
        refreshCognitiveLoadingPreview(pergunta, sessionContext, currentRequestId);

        // ✅ ETAPA A: histórico para contexto
        const messagesForApi = buildMessagesForApi(history, pergunta);

        try {
          const resp = await fetch("/api/chat-gpt4o", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "minha_chave_181199"
        },
       body: JSON.stringify({
  text: pergunta || "",
  image_base64: "",
  user_id: user ? user.id : "guest",
  conversation_id: conversationIdRef.current,
  messages: messagesForApi,
  session_context: buildApiSessionContext(sessionContext)
})
      });

            const data = await resp.json();
      const productsRaw = extractApiProducts(data);
      const detectedPriority = detectPriorityFromText(pergunta);

      setSelectedImageBase64("");
      setSelectedImagePreview("");
      setImageAttachmentMeta(null);

      if (data.session_context) {
        setSessionContext(data.session_context);
      } else {
        setSessionContext((prev) => ({
          ...prev,
          lastQuery: pergunta,

          // 🔥 PRIORIDADE (A CORREÇÃO MAIS IMPORTANTE)
          lastPriority: detectedPriority || prev.lastPriority || "",

          lastProducts: productsRaw.length > 0 ? productsRaw : prev.lastProducts,
          lastBestProduct: productsRaw.length > 0 ? productsRaw[0] : prev.lastBestProduct,
          lastInteractionType: productsRaw.length > 0 ? "search" : prev.lastInteractionType
        }));
      }
          const finalResponse = extractApiReply(data);
          const cardProduct = resolveOfferCardForTurn(
            productsRaw.length > 0 ? productsRaw[0] : null,
            pergunta
          );
          if (cardProduct) {
            trackMiaEvent("mia_recommendation_shown", {
              query_text: pergunta || "",
              category: detectAnalyticsCategory(pergunta),
              product_name: cardProduct.name || cardProduct.title || null,
              product_brand: cardProduct.brand || null,
              product_id: cardProduct.id || null,
              recommendation_name: cardProduct.name || cardProduct.title || null,
              user_id: user ? user.id : null,
              metadata: {
                has_offer_card: true,
                products_count: productsRaw.length
              }
            });
          }
          const commercialFallback = resolveCommercialFallbackFlag(data);
          const displayResponse = formatAssistantReplyForDisplay(finalResponse, {
            commercialFallback: commercialFallback && !!cardProduct
          });

          if (requestIdRef.current !== currentRequestId) return;

          setHistory((prev) => {
            const nh = [...prev];
            const idx = [...nh].reverse().findIndex((x) => x && x.assistantTemp);
            const finalMsg = buildAssistantHistoryEntry({
              resposta: displayResponse,
              cardProduct,
              commercialFallback: commercialFallback && !!cardProduct,
              turnId: currentRequestId
            });
            if (idx !== -1) nh[nh.length - 1 - idx] = finalMsg;
            else nh.push(finalMsg);
            return nh;
          });

          if (requestIdRef.current !== currentRequestId) return;

          incrementSessionSearchCount();
          tryShowEstimatedSavingsNotice(data, productsRaw, currentRequestId);
          tryShowAchievement(sessionSearchCount.current);

          finishAssistantReveal(displayResponse, !!cardProduct, currentRequestId);
        } catch {
          if (requestIdRef.current !== currentRequestId) return;
          setTyping(false);

          setHistory((prev) => {
            const nh = [...prev];
            const idx = [...nh].reverse().findIndex((x) => x && x.assistantTemp);
            const ti = idx === -1 ? nh.length : nh.length - 1 - idx;
            const errorMsg = buildAssistantHistoryEntry({
              resposta: "⚠️ Ops... Tive um problema ao conectar! Pode tentar novamente? 😊",
              turnId: currentRequestId
            });

            if (ti >= 0 && nh[ti]) nh[ti] = errorMsg;
            else nh.push(errorMsg);

            return nh;
          });
        } finally {
          abortCognitiveLoadingPreview();
          setLoading(false);
        }
      };

      fakeEnviar();
    }

    window.addEventListener("mia-suggestion", handleSuggestion);
    return () => window.removeEventListener("mia-suggestion", handleSuggestion);
  }, [user, history]);

    async function enviar() {
    if (!msg.trim() && !selectedImageBase64) return;

    const pergunta = msg.trim();
    const imageToSend = selectedImageBase64;

    setMsg("");

    if (revealInterval.current) clearInterval(revealInterval.current);
    setRevealText("");

    const currentRequestId = ++requestIdRef.current;

        setHistory((prev) => [
      ...prev,
      {
        pergunta: pergunta || (imageToSend ? "Imagem enviada" : ""),
        imagePreview: selectedImagePreview || "",
        resposta: null,
        price: null,
        offerCard: null,
        turnId: currentRequestId
      }
    ]);

    // Saudações simples seguem o fluxo normal da MIA no backend,
    // para evitar respostas fixas e comportamento robótico no frontend.

    setHistory((prev) => [
      ...prev,
      { assistantTemp: true, resposta: null, price: null, offerCard: null, turnId: currentRequestId }
    ]);
    setLoading(true);
    setTyping(true);
    resetCognitiveLoading(pergunta);
    refreshCognitiveLoadingPreview(pergunta, sessionContext, currentRequestId);

    // ✅ ETAPA A: histórico para contexto
    const messagesForApi = buildMessagesForApi(history, pergunta);

    trackMiaEvent("mia_question_sent", {
      query_text: pergunta || "",
      category: detectAnalyticsCategory(pergunta),
      user_id: user ? user.id : null,
      metadata: {
        has_image: !!imageToSend
      }
    });
    
    try {
      const resp = await fetch("/api/chat-gpt4o", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "minha_chave_181199"
        },
        body: JSON.stringify({
  text: pergunta || "",
  image_base64: imageToSend || "",
  user_id: user ? user.id : "guest",
  conversation_id: conversationIdRef.current,
  messages: messagesForApi,
  session_context: buildApiSessionContext(sessionContext)
})
      });

      const data = await resp.json();
      const productsRaw = extractApiProducts(data);
      const detectedPriority = detectPriorityFromText(pergunta);

      setSelectedImageBase64("");
      setSelectedImagePreview("");
      setImageAttachmentMeta(null);

      if (data.session_context) {
        setSessionContext(data.session_context);
      } else {
        setSessionContext((prev) => ({
          ...prev,
          lastQuery: pergunta,

          // 🔥 PRIORIDADE (A CORREÇÃO MAIS IMPORTANTE)
          lastPriority: detectedPriority || prev.lastPriority || "",

          lastProducts: productsRaw.length > 0 ? productsRaw : prev.lastProducts,
          lastBestProduct: productsRaw.length > 0 ? productsRaw[0] : prev.lastBestProduct,
          lastInteractionType: productsRaw.length > 0 ? "search" : prev.lastInteractionType
        }));
      }
      const finalResponse = extractApiReply(data);
      const cardProduct = resolveOfferCardForTurn(
        productsRaw.length > 0 ? productsRaw[0] : null,
        pergunta
      );
      if (cardProduct) {
        trackMiaEvent("mia_recommendation_shown", {
          query_text: pergunta || "",
          category: detectAnalyticsCategory(pergunta),
          product_name: cardProduct.product_name || cardProduct.name || cardProduct.title || null,
          product_brand: cardProduct.brand || null,
          product_id: cardProduct.id || null,
          recommendation_name: cardProduct.product_name || cardProduct.name || cardProduct.title || null,
          user_id: user ? user.id : null,
          metadata: {
            has_offer_card: true,
            products_count: productsRaw.length
          }
        });
      }
      const commercialFallback = resolveCommercialFallbackFlag(data);
      const displayResponse = formatAssistantReplyForDisplay(finalResponse, {
        commercialFallback: commercialFallback && !!cardProduct
      });

      if (requestIdRef.current !== currentRequestId) return;

      incrementSessionSearchCount();
      tryShowEstimatedSavingsNotice(data, productsRaw, currentRequestId);
      tryShowAchievement(sessionSearchCount.current);

      setHistory((prev) => {
        const nh = [...prev];
        const idx = [...nh].reverse().findIndex((x) => x && x.assistantTemp);
        const finalMsg = buildAssistantHistoryEntry({
          resposta: displayResponse,
          cardProduct,
          commercialFallback: commercialFallback && !!cardProduct,
          turnId: currentRequestId
        });
        if (idx !== -1) nh[nh.length - 1 - idx] = finalMsg;
        else nh.push(finalMsg);
        return nh;
      });

      if (requestIdRef.current !== currentRequestId) return;
      finishAssistantReveal(displayResponse, !!cardProduct, currentRequestId);
    } catch (e) {
      if (requestIdRef.current !== currentRequestId) return;
      console.error("Erro completo:", e);
      setTyping(false);

      setHistory((prev) => {
        const newHistory = [...prev];
        const idx = [...newHistory].reverse().findIndex((x) => x && x.assistantTemp);
        const trueIdx = idx === -1 ? newHistory.length : newHistory.length - 1 - idx;
        const errorMsg = buildAssistantHistoryEntry({
          resposta: "⚠️ Ops... Tive um problema ao conectar! Pode tentar novamente? 😊",
          turnId: currentRequestId
        });

        if (trueIdx >= 0 && newHistory[trueIdx]) {
          newHistory[trueIdx] = errorMsg;
        } else {
          newHistory.push(errorMsg);
        }

        return newHistory;
      });
    } finally {
      abortCognitiveLoadingPreview();
      setLoading(false);
    }
  }
function detectPriorityFromText(text = "") {
  const q = String(text).toLowerCase();

  if (/bateria|autonomia|carga|duracao|duração/.test(q)) return "battery";
  if (/jogo|jogar|gamer|desempenho|performance|processador/.test(q)) return "performance";
  if (/camera|câmera|foto|selfie/.test(q)) return "camera";
  if (/armazenamento|memoria|memória|gb|tb/.test(q)) return "storage";
  if (/barato|preco|preço|custo|beneficio/.test(q)) return "value";

  return "";
}
  function detectIntent(text) {
    const t = (text || "").toLowerCase();
    if (t.includes("melhor") || t.includes("qual o melhor") || t.includes("top")) return "compare";
    if (t.includes("preço") || t.includes("quanto") || t.includes("quanto custa")) return "price_check";
    if (t.includes("onde") || t.includes("comprar")) return "where_to_buy";
    return "general";
  }

  function getRandomFollowUp() {
    const phrases = [
      "Quer comparar com outro modelo? 💜",
      "Prefere ver opções mais baratas? 😎",
      "Se quiser, posso achar alternativas melhores 😉",
      "Quer que eu ache um custo-benefício top? 🔍",
      "Posso monitorar outros preços pra você! 🔔"
    ];
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  async function handleFavorite(prod, actingUser = user) {
    if (!actingUser) {
      setPendingAction({ type: "favorite", data: prod });
      setShowLoginPopup(true);
      return;
    }

    if (findProductByIdentity(favorites, prod)) {
      showActionToast("Este produto já está nos seus favoritos.", "neutral");
      return;
    }

    if (actionBusy === "favorite") return;
    setActionBusy("favorite");

    try {
      const resp = await fetch("/api/save-wish", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": MIA_API_KEY
        },
        body: JSON.stringify({
          user_id: actingUser.id,
          product_name: prod.product_name || prod.title || "Produto",
          product_url: prod.link || "",
          price: parsePriceValue(prod.price)
        })
      });

      const data = await resp.json();

      if (resp.ok && data.success) {
        const newFav = data.wish
          ? mapWishToFavorite({
              ...data.wish,
              thumbnail: prod.thumbnail || prod.image || "",
              source: prod.source || prod.store || "",
            })
          : {
              id: `fav-${Date.now()}`,
              product_name: prod.product_name || prod.title || "Produto",
              price: prod.price || "",
              link: prod.link || "",
              thumbnail: prod.thumbnail || prod.image || "",
              source: prod.source || prod.store || "",
            };
        setFavorites((prev) => {
          if (findProductByIdentity(prev, newFav)) return prev;
          return [newFav, ...prev.filter((f) => f.id !== newFav.id)];
        });
        trackMiaEvent("favorite_created", {
          category: detectAnalyticsCategory(prod.product_name || prod.title || prod.name || ""),
          product_name: prod.product_name || prod.name || prod.title || null,
          product_brand: prod.brand || null,
          product_id: prod.id || null,
          offer_store: prod.source || prod.store || null,
          offer_price: prod.numericPrice || prod.price || null,
          offer_url: prod.link || null,
          user_id: actingUser ? actingUser.id : null,
          metadata: {
            action_source: "offer_card"
          }
        });
        showActionToast("⭐ Produto favoritado!", "success");
      } else {
        showActionToast("Não consegui favoritar agora. Tente de novo.", "error");
      }
    } catch (e) {
      console.error("Erro ao favoritar:", e);
      showActionToast("Erro ao favoritar. Verifique sua conexão.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  async function createPriceAlert(prod, actingUser = user, targetOverride = null) {
    if (!actingUser) {
      setPendingAction({ type: "monitor", data: prod });
      setShowLoginPopup(true);
      return false;
    }

    const numericPrice = (() => {
      if (!prod.price) return null;
      const parsed = String(prod.price)
        .replace(/[^\d,.-]/g, "")
        .replace(/\.(?=\d{3}(\D|$))/g, "")
        .replace(",", ".");
      const value = parseFloat(parsed);
      return Number.isNaN(value) ? null : value;
    })();

    const targetPrice = targetOverride != null ? targetOverride : numericPrice;

    const resp = await fetch("/api/create-price-alert", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": MIA_API_KEY
      },
      body: JSON.stringify({
        user_id: actingUser.id,
        user_email: actingUser.email || null,
        product_name: prod.product_name || prod.title || "Produto",
        product_url: prod.link || "",
        product_thumbnail: prod.thumbnail || prod.image || "",
        source: prod.source || "",
        current_price: numericPrice,
        target_price: targetPrice
      })
    });

    const data = await resp.json();

    if (!resp.ok || !data.success) {
      throw new Error(data.error || "Falha ao criar alerta");
    }

    if (data.data?.[0]) {
      upsertAlert(data.data[0], actingUser.id);
    }
    
    trackMiaEvent("price_alert_created", {
      category: detectAnalyticsCategory(prod.product_name || prod.title || prod.name || ""),
      product_name: prod.product_name || prod.name || prod.title || null,
      product_brand: prod.brand || null,
      product_id: prod.id || null,
      offer_store: prod.source || prod.store || null,
      offer_price: numericPrice || null,
      offer_url: prod.link || null,
      user_id: actingUser ? actingUser.id : null,
      metadata: {
        action_source: targetOverride != null ? "alert_form" : "offer_card",
        target_price: targetPrice || null,
        current_price: numericPrice || null
      }
    });
    
    return true;
  }

  async function handleMonitor(prod, actingUser = user) {
    if (!actingUser) {
      setPendingAction({ type: "monitor", data: prod });
      setShowLoginPopup(true);
      return;
    }

    if (findProductByIdentity(watches, prod)) {
      showActionToast("Você já está monitorando este produto.", "neutral");
      return;
    }

    if (actionBusy === "monitor") return;
    setActionBusy("monitor");

    try {
      await createPriceAlert(prod, actingUser);
      showActionToast("🔔 Alerta de preço ativado!", "success");
    } catch (e) {
      console.error("Erro ao criar alerta:", e);
      showActionToast("Não consegui ativar o alerta agora.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleCreateAlertFromForm(formData = {}) {
    if (!user) {
      setPendingAction({ type: "create-alert" });
      setShowLoginPopup(true);
      return;
    }

    if (actionBusy === "create-alert") return;

    const productName = String(formData.productName || "").trim();
    if (!productName) {
      showActionToast("Informe o produto que você quer acompanhar.", "error");
      return;
    }

    if (findProductByIdentity(watches, { product_name: productName, link: "", source: "" })) {
      showActionToast("Você já está monitorando este produto.", "neutral");
      return;
    }

    const seenPrice = parseAlertPriceInput(formData.seenPrice);
    let targetPrice = parseAlertPriceInput(formData.targetPrice);
    const discountPercent = parseAlertPriceInput(formData.discountPercent);

    if (targetPrice == null && seenPrice != null && discountPercent != null) {
      targetPrice = Math.round(seenPrice * (1 - discountPercent / 100) * 100) / 100;
    }

    if (targetPrice == null && seenPrice == null) {
      showActionToast("Informe quanto você gostaria de pagar ou uma queda em %.", "error");
      return;
    }

    if (targetPrice == null && seenPrice != null) {
      targetPrice = seenPrice;
    }

    setActionBusy("create-alert");

    try {
      await createPriceAlert(
        {
          product_name: productName,
          price: seenPrice,
          link: "",
          thumbnail: "",
          source: "",
        },
        user,
        targetPrice
      );
      showActionToast("🔔 Alerta inteligente ativado!", "success");
    } catch (e) {
      console.error("Erro ao criar alerta:", e);
      showActionToast("Não consegui ativar o alerta agora.", "error");
    } finally {
      setActionBusy(null);
    }
  }

  async function createUser(email, nome) {
    const nameTrim = String(nome || "").trim();
    const emailTrim = String(email || "").trim().toLowerCase();

    if (!nameTrim) {
      showActionToast("Digite seu nome para continuar.", "error");
      return;
    }
    if (!emailTrim || !emailTrim.includes("@") || !emailTrim.includes(".")) {
      showActionToast("Digite um email válido.", "error");
      return;
    }

    const action = pendingAction;
    let newUser = {
      id: `local-${Date.now()}`,
      email: emailTrim,
      nome: nameTrim,
      created_at: new Date().toISOString(),
    };

    try {
      const resp = await fetch("/api/register-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailTrim, name: nameTrim }),
      });
      const data = await resp.json();
      if (data?.success && data?.user) {
        newUser = {
          id: data.user.id ?? newUser.id,
          email: data.user.email || emailTrim,
          nome: data.user.name || nameTrim,
          created_at: data.user.created_at || newUser.created_at,
        };
      }
    } catch (e) {
      console.warn("register-user: usando sessão local.", e);
    }

    saveUserProfile(newUser.id, { displayName: nameTrim, photoDataUrl: "" });
    setUserProfile({ displayName: nameTrim, photoDataUrl: "" });
    setUser(newUser);
    saveStoredUser(newUser);
    setShowLoginPopup(false);
    setPendingAction(null);

    if (action) {
      setTimeout(() => {
        if (action.type === "favorite") {
          handleFavorite(action.data, newUser);
        } else if (action.type === "monitor") {
          handleMonitor(action.data, newUser);
        } else if (action.type === "create-alert") {
          setAlertsPanelOpen(true);
          scrollToAlertsCreateForm();
        }
      }, 300);
    }
  }

  const isIntroState = hasMounted
    && history.length === 1
    && history[0]?.resposta
    && !history[0]?.pergunta
    && !history[0]?.offerCard;

  const hasConversationResponse = hasMounted && history.some((item, index) => {
    if (!item?.resposta) return false;
    if (item.pergunta || item.offerCard) return true;
    return index > 0;
  });

  const isConversationMode = hasMounted && hasConversationResponse;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("mia-app-intro", Boolean(isIntroState));
    document.body.classList.toggle("mia-app-conversation", Boolean(isConversationMode));
    return () => {
      document.body.classList.remove("mia-app-intro", "mia-app-conversation");
    };
  }, [isIntroState, isConversationMode]);

  const introSuggestions = [
    "📱 Celular até 2.000",
    "🎮 PS5 Slim ou Xbox Série X",
    "💻 Notebook pra trabalho",
    "🎧 Fone custo-benefício"
  ];

  const composerBusy = loading || imageAnalysisLoading;
  const imageSourceLabel = imageAttachmentMeta?.source === "camera"
    ? "Capturada agora"
    : imageAttachmentMeta?.source === "gallery"
      ? "Selecionada da galeria"
      : "";

  const loginSheetTitle = pendingAction?.type === "favorite"
    ? "Salvar nos favoritos"
    : pendingAction?.type === "monitor"
      ? "Ativar alerta de preço"
      : "Continue com a MIΛ";

  const loginSheetHint = pendingAction?.type === "favorite"
    ? "Crie sua conta para salvar este produto nos favoritos."
    : pendingAction?.type === "monitor"
      ? "Crie sua conta para monitorar preços e receber alertas."
      : "Crie sua conta para salvar favoritos, monitorar preços e receber alertas inteligentes.";

  return (
    <div
      ref={chatRootRef}
      className={`mia-chat-root${
        favoritesPanelOpen || alertsPanelOpen || profilePanelOpen || settingsPanelOpen || helpPanelOpen || howItWorksPanelOpen || historyPanelOpen || showLoginPopup || sideMenuOpen
          ? " mia-chat-root--modal-open"
          : ""
      }${showLoginPopup ? " mia-chat-root--login-open" : ""}${
        sideMenuOpen ? " mia-chat-root--drawer-open" : ""
      }${isIntroState ? " mia-chat-root--intro" : ""}${
        isConversationMode ? " mia-chat-root--conversation" : ""
      }`}
    >

      {/* Header */}
      <div className="mia-chat-header-shell">
        <div className="mia-chat-header">
          <button
            type="button"
            className={`mia-menu-btn${sideMenuOpen ? " mia-menu-btn--open" : ""}`}
            onClick={toggleSideMenu}
            aria-label={sideMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={sideMenuOpen}
            aria-controls="mia-side-drawer"
          >
            <span className="mia-menu-btn-icon" aria-hidden="true">☰</span>
          </button>
          <div className="mia-chat-header-brand">
            {isConversationMode ? (
              <>
                <div className="mia-chat-header-logo mia-chat-header-logo--compact">
                  <MIAAvatar size="compact" alt="Assistente MIΛ" />
                </div>
                <div className="mia-chat-header-copy mia-chat-header-copy--compact">
                  <div className="mia-chat-header-title-row">
                    <h2 className="mia-chat-header-title">
                      <MIAWordmark size="md" showBeta={false} />
                    </h2>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="mia-chat-header-logo">
                  <MIAAvatar size="header" alt="Assistente MIΛ" />
                </div>
                <div className="mia-chat-header-copy">
                  <div className="mia-chat-header-title-row">
                    <h2 className="mia-chat-header-title">
                      <MIAWordmark size="md" showBeta={!isIntroState} />
                    </h2>
                    <span className="mia-chat-header-status" aria-hidden="true" title="Online" />
                  </div>
                  <p className="mia-chat-header-tagline">A IA especialista em compras online</p>
                </div>
              </>
            )}
          </div>

        </div>
      </div>

      <div
        ref={scrollRef}
        className={`fade-in mia-chat-messages${isIntroState ? " mia-chat-messages--intro" : ""}`}
        style={{ paddingRight: 6 }}
      >
        {hasMounted && openingTyping && !greetingShown && (
          <div className="mia-chat-turn mia-chat-turn--opening-typing" aria-live="polite">
            <div className="mia-msg-assistant-row mia-msg-assistant-row--opening-presence mia-msg-assistant-row--no-avatar">
              <div
                className="mia-opening-presence-bubble mia-opening-presence-bubble--arrival"
                aria-label="MIΛ está digitando"
              >
                <p className="mia-opening-presence-text">
                  <span className="mia-opening-presence-verb">MIΛ está digitando…</span>
                  <span className="mia-opening-presence-dots" aria-hidden="true">
                    <span className="mia-opening-presence-dot" style={{ animationDelay: "0s" }} />
                    <span className="mia-opening-presence-dot" style={{ animationDelay: "0.18s" }} />
                    <span className="mia-opening-presence-dot" style={{ animationDelay: "0.36s" }} />
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        {hasMounted && history.map((item, i) => (
          <div key={item.turnId ?? `turn-${i}`} className={`mia-chat-turn${isIntroState ? " mia-chat-turn--intro" : ""}`}>
                       {(item.pergunta || item.imagePreview) && (
              <div className="mia-msg-user">
                {item.imagePreview && (
                  <div className="mia-msg-user-image-wrap">
                    <img
                      src={item.imagePreview}
                      alt="Imagem enviada"
                      className="mia-msg-user-image"
                      decoding="async"
                    />
                  </div>
                )}

                {item.pergunta}
              </div>
            )}

            {item.resposta && (
              <div
                className={`mia-msg-assistant-row mia-msg-assistant-row--no-avatar${
                  item.isMiaOpening ? " mia-msg-assistant-row--hero-opening" : ""
                }`}
              >
                <div
                  className={`mia-msg-assistant-bubble${item.isMiaOpening ? " mia-msg-assistant-bubble--hero-opening" : ""}`}
                  aria-label={item.isMiaOpening ? "Mensagem de boas-vindas da MIΛ" : undefined}
                >
                  {!item.isMiaOpening && (
                  <span className={`mia-msg-label${item.offerCard ? " mia-msg-label--pick" : ""}`}>
                    {item.offerCard ? (
                      <>
                        <span className="mia-msg-label-prefix">Recomendação </span>
                        <MIAWordmark size="xs" />
                      </>
                    ) : (
                      <MIAWordmark size="xs" />
                    )}
                  </span>
                  )}

                  {item.offerCard && (() => {
                    const offerCard = item.offerCard;
                    const cardTitle = getOfferCardTitle(offerCard);
                    const galleryImages = getOfferCardImages(offerCard);
                    const imageUrl = galleryImages[0] || "";
                    const presentation = resolveOfferCardPresentation(offerCard);
                    const priceUnavailable = presentation.priceUnavailable;
                    const storeDisplay = presentation.useDataLayerPresentation
                      ? {
                          primary: presentation.sourceLabel,
                          secondary: priceUnavailable ? null : presentation.subtitle,
                          isFallback: true,
                        }
                      : formatStoreDisplay(offerCard.source || "");

                    return (
                    <div className="mia-offer-card product-card-hover">
                      <span className="mia-offer-card-badge">Oferta selecionada</span>
                      {presentation.badge && (
                        <p className="mia-offer-card-data-layer-badge">{presentation.badge}</p>
                      )}
                      <div className="mia-offer-card-main">
                        <OfferCardMedia
                          src={imageUrl}
                          alt={cardTitle}
                          galleryEnabled={galleryImages.length > 0}
                          onOpenGallery={() => openOfferImageLightbox(offerCard)}
                        />
                        <div className="mia-offer-card-info">
                          <p className="mia-offer-card-name">{cardTitle}</p>
                          <div className="mia-offer-card-price-block">
                            {presentation.priceLabel && (
                              <span className="mia-offer-card-price-label">{presentation.priceLabel}</span>
                            )}
                            <p className={`mia-offer-card-price${priceUnavailable ? " mia-offer-card-price--unavailable" : ""}`}>
                              {priceUnavailable ? presentation.priceText : formatPrice(offerCard.price)}
                            </p>
                            {priceUnavailable && presentation.subtitle && (
                              <p className="mia-offer-card-price-subtitle">{presentation.subtitle}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mia-offer-card-store">
                        <span className="mia-offer-card-store-dot" aria-hidden="true" />
                        <p className="mia-offer-card-source">
                          {storeDisplay.isFallback ? (
                            <>
                              <span className="mia-offer-card-source-primary">{storeDisplay.primary}</span>
                              {storeDisplay.secondary && (
                                <span className="mia-offer-card-source-secondary">{storeDisplay.secondary}</span>
                              )}
                            </>
                          ) : (
                            <>
                              Disponível em{" "}
                              <span className="mia-offer-card-source-primary">{storeDisplay.primary}</span>
                            </>
                          )}
                        </p>
                      </div>
                      {offerCard.link ? (
                       <a
                       className="mia-offer-card-cta"
                       href={offerCard.link}
                       target="_blank"
                       rel="noreferrer"
                       onClick={() => {
                         trackMiaEvent("offer_click", {
                           category: detectAnalyticsCategory(offerCard.product_name || offerCard.title || ""),
                           product_name: offerCard.product_name || offerCard.name || offerCard.title || null,
                           product_brand: offerCard.brand || null,
                           product_id: offerCard.id || null,
                           offer_store: offerCard.source || offerCard.store || null,
                           offer_price: offerCard.numericPrice || offerCard.price || null,
                           offer_url: offerCard.link || null,
                           metadata: {
                             button_text: "Ver oferta"
                           }
                         });
                       }}
                     >
                          Ver oferta
                          <span className="mia-offer-card-cta-arrow" aria-hidden="true">→</span>
                        </a>
                      ) : (
                        <span className="mia-offer-card-cta mia-offer-card-cta--unavailable" aria-disabled="true">
                          {presentation.ctaText || "Nenhuma oferta atual encontrada"}
                        </span>
                      )}
                      <div className="mia-offer-card-actions">
                        <button
                          type="button"
                          className={`mia-offer-card-action-btn mia-offer-card-action-btn--fav${
                            isProductFavorited(offerCard) ? " mia-offer-card-action-btn--fav-active" : ""
                          }${actionBusy === "favorite" ? " mia-offer-card-action-btn--busy" : ""}`}
                          onClick={() => handleFavorite(offerCard)}
                          disabled={actionBusy === "favorite"}
                          aria-label="Favoritar"
                        >
                          <span className="mia-offer-card-action-icon">⭐</span>
                          <span className="mia-offer-card-action-label">
                            {actionBusy === "favorite"
                              ? "Salvando..."
                              : isProductFavorited(offerCard)
                                ? "Favoritado"
                                : "Favoritar"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className={`mia-offer-card-action-btn mia-offer-card-action-btn--mon${
                            isProductMonitored(offerCard) ? " mia-offer-card-action-btn--mon-active" : ""
                          }${actionBusy === "monitor" ? " mia-offer-card-action-btn--busy" : ""}`}
                          onClick={() => handleMonitor(offerCard)}
                          disabled={actionBusy === "monitor" || isProductMonitored(offerCard)}
                          aria-label="Monitorar"
                        >
                          <span className="mia-offer-card-action-icon">🔔</span>
                          <span className="mia-offer-card-action-label">
                            {actionBusy === "monitor"
                              ? "Ativando..."
                              : isProductMonitored(offerCard)
                                ? "Monitorando"
                                : "Monitorar"}
                          </span>
                        </button>
                      </div>
                    </div>
                    );
                  })()}

                  {estimatedSavingsMessage &&
                    estimatedSavingsTurnId === item.turnId && (
                      <MIAEstimatedSavingsNotice
                        message={estimatedSavingsMessage}
                        inFlow
                        onComplete={clearEstimatedSavingsNotice}
                      />
                    )}

                  {(() => {
                    const assistantBodyText = resolveAssistantBodyText(item, i, {
                      typing,
                      revealText,
                      historyLength: history.length,
                    });
                    const structuredParagraphs =
                      !item.isMiaOpening && shouldUseStructuredParagraphs(assistantBodyText);

                    return (
                  <div className={`mia-msg-body${item.offerCard ? " mia-msg-body--with-card" : ""}${item.isMiaOpening ? " mia-msg-body--opening" : ""}${structuredParagraphs ? " mia-msg-body--structured" : ""}`}>
                    {item.isMiaOpening ? (
                      <div className="mia-opening-moment">
                        <p className="mia-opening-utterance">
                          {renderOpeningUtterance(
                            item.openingMicroturn,
                            item.openingBasePhrase,
                            item.resposta
                          )}
                        </p>
                      </div>
                    ) : (
                      renderAssistantBodyContent(assistantBodyText)
                    )}
                  </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {i === 0 && item.resposta && history.length === 1 && (
              <div className="mia-empty-welcome mia-empty-welcome--after-opening">
                <p className="mia-empty-welcome-title">Comece por aqui</p>
                <p className="mia-empty-welcome-hint">Toque em uma sugestão ou conte para a MIA o que você está pensando em comprar.</p>
                <div className="mia-empty-suggestions">
                {introSuggestions.map((sugestao) => (
                  <button
                    key={sugestao}
                    type="button"
                    className="suggestion-btn suggestion-btn--secondary"
                    onClick={() => {
                      setMsg(sugestao);
                      setTimeout(() => {
                        const event = new CustomEvent("mia-suggestion", { detail: sugestao });
                        window.dispatchEvent(event);
                      }, 50);
                    }}
                  >
                    {sugestao}
                  </button>
                ))}
                </div>
              </div>
            )}

            {item.assistantTemp && !item.resposta && (typing || loading || imageAnalysisLoading) && (
              <div className="mia-msg-assistant-row mia-msg-assistant-row--no-avatar">
                <div className="mia-msg-assistant-bubble mia-msg-loading mia-msg-loading--active">
                  <span className="mia-msg-label">
                    <MIAWordmark size="xs" />
                  </span>
                  <div className="mia-thinking">
                    <div className="mia-thinking-bar" aria-hidden="true" />
                    <p className="mia-loading-text">
                      {item.loadingKind === "image-analysis"
                        ? "MIΛ está analisando sua imagem..."
                        : cognitiveLoading?.description || getCognitiveLoadingFallbackState().description}
                      <span className="mia-loading-dots" aria-hidden="true">
                        <span className="typing-dot" style={{ animationDelay: "0s" }}></span>
                        <span className="typing-dot" style={{ animationDelay: "0.15s" }}></span>
                        <span className="typing-dot" style={{ animationDelay: "0.3s" }}></span>
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} className="mia-chat-scroll-anchor" aria-hidden="true" />
      </div>

      <div
        ref={footerRef}
        className={`mia-chat-footer${isIntroState ? " mia-chat-footer--intro" : ""}`}
      >
      <div className="mia-chat-input-row">
      <label
        className={`mia-chat-icon-btn mia-chat-composer-tool mia-chat-media-btn mia-chat-camera-btn${
          selectedImagePreview ? " mia-chat-media-btn--active" : ""
        }${composerBusy ? " mia-chat-media-btn--disabled" : ""}`}
        title="Tirar foto"
        aria-label="Tirar foto com a câmera"
      >
        📸
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(event) => handleImageInputChange(event, "camera")}
          style={{ display: "none" }}
          disabled={composerBusy}
        />
      </label>
      <label
        className={`mia-chat-icon-btn mia-chat-composer-tool mia-chat-media-btn mia-chat-gallery-btn${
          selectedImagePreview ? " mia-chat-media-btn--active" : ""
        }${composerBusy ? " mia-chat-media-btn--disabled" : ""}`}
        title="Escolher da galeria"
        aria-label="Escolher imagem da galeria"
      >
        🖼️
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => handleImageInputChange(event, "gallery")}
          style={{ display: "none" }}
          disabled={composerBusy}
        />
      </label>
        <div className="mia-chat-input-wrap">
          <input
            ref={inputRef}
            value={msg}
            onChange={(e) => {
              setMsg(e.target.value);
              if (e.target.value.trim()) stopPlaceholderAnimation();
            }}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={(e) => {
                if (e.key === "Enter") {
                  enviar();
                }
              }}
            placeholder=""
            disabled={composerBusy}
            className="mia-input"
            aria-label="Mensagem para a MIA"
          />
          {hasMounted && !msg && !composerBusy && (
            <div className="mia-input-placeholder" aria-hidden="true">
              <span ref={placeholderTextRef} className="mia-input-placeholder-text" />
              <span className="mia-input-placeholder-cursor" aria-hidden="true" />
            </div>
          )}
        </div>
        
        <button
          type="button"
          className={`mia-chat-icon-btn mia-chat-composer-tool mia-chat-mic-btn${
            isListening ? " mia-chat-icon-btn--listening" : ""
          }`}
          onClick={toggleVoz}
          title={isListening ? "Parar gravação" : "Falar com a MIΛ"}
          aria-label={isListening ? "Parar gravação de voz" : "Falar com a MIΛ"}
          aria-pressed={isListening}
          disabled={composerBusy}
        >
          {isListening ? "🔴" : "🎙️"}
        </button>
      </div>

      {selectedImagePreview && (
        <ChatImageAttachment
          preview={selectedImagePreview}
          sourceLabel={imageSourceLabel}
          disabled={composerBusy}
          onReplace={replaceSelectedImage}
          onRemove={removeSelectedImage}
          onSubmit={submitImageForAnalysis}
        />
      )}

      <div className="mia-chat-send-row">
      <button
  type="button"
  onClick={() => {
    enviar();
  }}
  disabled={composerBusy || (!msg.trim() && !selectedImageBase64)}
          className={`send-btn${loading ? " send-btn--loading" : ""}`}
        >
          {loading
            ? cognitiveLoading?.title || getCognitiveLoadingFallbackState().title
            : "Perguntar para a MIA"}
        </button>
      </div>
      </div>


      {hasMounted && (
        <OfferImageLightbox
          lightbox={offerImageLightbox}
          onClose={closeOfferImageLightbox}
        />
      )}

      {hasMounted && showLoginPopup && typeof document !== "undefined" && createPortal(
        <div
          className="mia-login-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mia-login-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeLoginPopup();
          }}
        >
          <div className="mia-login-card">
            <h3 id="mia-login-title" className="mia-login-card-title">{loginSheetTitle}</h3>
            <p className="mia-login-card-hint">{loginSheetHint}</p>
            <label className="mia-login-field" htmlFor="popupNome">
              <span className="mia-login-field-label">Seu nome</span>
              <input
                id="popupNome"
                type="text"
                name="name"
                autoComplete="name"
                enterKeyHint="next"
                placeholder="Como você quer ser chamado"
                className="mia-login-input"
              />
            </label>
            <label className="mia-login-field" htmlFor="popupEmail">
              <span className="mia-login-field-label">Seu email</span>
              <input
                id="popupEmail"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="done"
                placeholder="seu@email.com"
                className="mia-login-input"
              />
            </label>
            <div className="mia-login-actions">
              <button
                type="button"
                className="mia-login-btn mia-login-btn--primary"
                onClick={() =>
                  createUser(
                    document.getElementById("popupEmail")?.value,
                    document.getElementById("popupNome")?.value
                  )
                }
              >
                Continuar
              </button>
              <button
                type="button"
                className="mia-login-btn mia-login-btn--ghost"
                onClick={closeLoginPopup}
              >
                Agora não
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {hasMounted && sideMenuOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="mia-drawer-overlay"
            onClick={closeSideMenu}
            aria-hidden="true"
          />
          <nav
            id="mia-side-drawer"
            className="mia-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu Teilor"
          >
            <div className="mia-drawer-header">
              <h2 className="mia-drawer-brand">Teilor</h2>
              <p className="mia-drawer-powered">
                Powered by <MIAWordmark size="xs" className="mia-drawer-powered-wordmark" />
              </p>
            </div>

            {user && drawerUserName !== "Visitante" && (
              <p className="mia-drawer-greeting">Olá, {drawerUserFirstName}</p>
            )}

            <button
              type="button"
              className="mia-drawer-primary"
              onClick={() => handleDrawerAction("chat")}
            >
              <MIAMenuSymbol />
              Conversar com a MIΛ
            </button>

            <button
              type="button"
              className="mia-drawer-feed-btn"
              onClick={() => handleDrawerAction("feed")}
            >
              <MIAMenuSymbol />
              Feed MIΛ
            </button>

            <div className="mia-drawer-user-card">
              {user ? (
                <>
                  <div className="mia-drawer-user-avatar" aria-hidden="true">
                    {userProfile.photoDataUrl ? (
                      <img src={userProfile.photoDataUrl} alt="" className="mia-drawer-user-avatar-image" />
                    ) : (
                      drawerUserName.slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="mia-drawer-user-copy">
                    <p className="mia-drawer-user-name">{drawerUserName}</p>
                    <p className="mia-drawer-user-sub">{drawerUserSub}</p>
                  </div>
                </>
              ) : (
                <div className="mia-drawer-guest-card">
                  <p className="mia-drawer-guest-title">Entre na sua conta</p>
                  <p className="mia-drawer-guest-text">
                    Faça login para salvar favoritos, monitorar preços e personalizar sua experiência.
                  </p>
                  <button
                    type="button"
                    className="mia-drawer-guest-cta"
                    onClick={() => {
                      closeSideMenu();
                      setShowLoginPopup(true);
                    }}
                  >
                    Entrar na sua conta
                  </button>
                </div>
              )}
            </div>

            <section className="mia-drawer-section">
              <h3 className="mia-drawer-section-title">MIA</h3>
              <div className="mia-drawer-nav">
                <button
                  type="button"
                  className="mia-drawer-nav-item"
                  onClick={() => handleDrawerAction("how-it-works")}
                >
                  <span className="mia-drawer-nav-icon" aria-hidden="true">✨</span>
                  Como a MIΛ funciona
                </button>
              </div>
            </section>

            <section className="mia-drawer-section">
              <h3 className="mia-drawer-section-title">MEUS DADOS</h3>
              <div className="mia-drawer-nav">
                <button
                  type="button"
                  className="mia-drawer-nav-item"
                  onClick={() => handleDrawerAction("favorites")}
                >
                  <span className="mia-drawer-nav-icon" aria-hidden="true">♡</span>
                  Favoritos
                </button>
                <button
                  type="button"
                  className="mia-drawer-nav-item"
                  onClick={() => handleDrawerAction("alerts")}
                >
                  <span className="mia-drawer-nav-icon" aria-hidden="true">🔔</span>
                  Alertas Inteligentes
                </button>
              </div>
            </section>

            <section className="mia-drawer-section">
              <h3 className="mia-drawer-section-title">CONTA</h3>
              <div className="mia-drawer-nav">
                <button
                  type="button"
                  className="mia-drawer-nav-item"
                  onClick={() => handleDrawerAction("profile")}
                >
                  <span className="mia-drawer-nav-icon" aria-hidden="true">👤</span>
                  Meu Perfil
                </button>
                <button
                  type="button"
                  className="mia-drawer-nav-item"
                  onClick={() => handleDrawerAction("settings")}
                >
                  <span className="mia-drawer-nav-icon" aria-hidden="true">⚙️</span>
                  Configurações
                </button>
                <button
                  type="button"
                  className="mia-drawer-nav-item"
                  onClick={() => handleDrawerAction("help")}
                >
                  <span className="mia-drawer-nav-icon" aria-hidden="true">❓</span>
                  Ajuda
                </button>
              </div>
            </section>

            <footer className="mia-drawer-footer">
              <span className="mia-drawer-footer-highlight">
                A IA especializada em compras online
              </span>
            </footer>
          </nav>
        </>,
        document.body
      )}

      {hasMounted && hubPanelOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            className="mia-panel-overlay"
            onClick={closeHubPanelFromDrawer}
            aria-hidden="true"
          />

          {feedPanelOpen && (
            <FeedPanel
              onClose={closeHubPanelFromDrawer}
              onScrollToChat={scrollToChatFromPanel}
              onFavorite={handleFavorite}
              onMonitor={handleMonitor}
              onAskMia={handleAskMiaAboutFeedProduct}
              onOpenGallery={openFeedImageLightbox}
              actionBusy={actionBusy}
            />
          )}

          {helpPanelOpen && (
            <MIAHelpPanel
              onClose={closeHubPanelFromDrawer}
              onScrollToChat={scrollToChatFromPanel}
              defaultName={drawerUserName !== "Visitante" ? drawerUserName : ""}
              defaultEmail={user?.email || ""}
              onSubmitSupport={handleHelpSupportSubmit}
            />
          )}

          {howItWorksPanelOpen && (
            <MIAHowItWorksPanel onClose={closeHubPanelFromDrawer} />
          )}

          {settingsPanelOpen && (
            <MIASettingsPanel
              onClose={closeHubPanelFromDrawer}
              onClearCache={handleClearLocalCache}
              cacheBusy={actionBusy === "clear-cache"}
            />
          )}

          {profileEditPanelOpen && (
            <MIAProfileEditPanel
              user={user}
              profile={userProfile}
              onClose={closeProfileEditPanel}
              onSave={handleSaveProfileEdit}
              saving={actionBusy === "save-profile"}
            />
          )}

          {profilePanelOpen && !profileEditPanelOpen && (
            <MIAProfilePanel
              user={user}
              displayName={drawerUserName}
              profilePhoto={userProfile.photoDataUrl}
              metrics={computeProfileMetrics()}
              preferences={[]}
              onClose={closeHubPanelFromDrawer}
              onEditProfile={handleEditProfile}
              onOpenAlerts={openAlertsFromProfile}
              onOpenFavorites={openFavoritesFromProfile}
              onScrollToChat={scrollToChatFromPanel}
            />
          )}

          {alertsPanelOpen && (
            <MIAAlertsPanel
              alerts={watches}
              favorites={favorites}
              onClose={closeHubPanelFromDrawer}
              onScrollToChat={scrollToChatFromPanel}
              onOpenFavorites={openFavoritesFromAlerts}
              onCreateAlert={handleCreateAlertFromForm}
              onStartFirstAlert={handleStartFirstAlert}
              onFavorite={handleFavorite}
              onRemoveAlert={handleRemoveAlert}
              onAskMia={handleAskMiaAboutAlertProduct}
              isFavorited={isProductFavorited}
              formatPrice={formatPrice}
              actionBusy={actionBusy}
            />
          )}

          {favoritesPanelOpen && (
            <MIAFavoritesPanel
              favorites={favorites}
              onClose={closeHubPanelFromDrawer}
              onScrollToChat={scrollToChatFromPanel}
              onAskMia={handleAskMiaAboutFavorite}
              onMonitor={handleMonitor}
              onRemove={handleRemoveFavorite}
              formatPrice={formatPrice}
              actionBusy={actionBusy}
            />
          )}

          {historyPanelOpen && (
            <div className="mia-side-panel mia-side-panel--history mia-hub-panel" role="dialog" aria-modal="true" aria-label="Histórico">
              <div className="mia-side-panel-header">
                <div>
                  <h4 className="mia-side-panel-title">Histórico</h4>
                  <p className="mia-side-panel-subtitle">Suas conversas recentes com a MIΛ</p>
                </div>
                <button
                  type="button"
                  className="mia-panel-close-btn"
                  onClick={closeHubPanelFromDrawer}
                  aria-label="Fechar histórico"
                >
                  Fechar
                </button>
              </div>
              {history.filter((h) => h.pergunta).length === 0 && (
                <div className="mia-panel-empty">
                  <div className="mia-panel-empty-icon" aria-hidden="true">🔍</div>
                  <p className="mia-panel-empty-title">Ainda não há histórico</p>
                  <p className="mia-panel-empty-hint">
                    Suas conversas aparecerão aqui conforme você usar a MIΛ.
                  </p>
                </div>
              )}
              {history
                .filter((h) => h.pergunta)
                .slice()
                .reverse()
                .map((h, idx) => (
                  <div key={idx} className="mia-panel-item mia-panel-item--history">
                    <div className="mia-panel-item-title">{h.pergunta}</div>
                    <div className="mia-panel-item-snippet">
                      {h.resposta && (h.resposta.length > 160 ? h.resposta.slice(0, 160) + "..." : h.resposta)}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </>,
        document.body
      )}

      {/* Toast de ações (favoritar / monitorar) */}
      {hasMounted && (
        <div aria-live="polite" aria-atomic="true" style={{ position: "fixed", top: 0, left: 0, width: 1, height: 1, overflow: "hidden" }}>
          {actionToast?.message}
        </div>
      )}
      {hasMounted && actionToast && (
        <div
          className={`mia-toast mia-toast--top mia-action-toast mia-toast--${actionToast.variant}`}
          role="status"
        >
          {actionToast.message}
        </div>
      )}

      {/* Toast de conquista */}
      {achievementToast && (
        <div
          className="mia-toast mia-toast--bottom-stack mia-toast--achievement mia-achievement-toast"
          role="status"
          style={{
            bottom:
              "calc(var(--mia-footer-height, 118px) + 10px + env(safe-area-inset-bottom, 0px) + var(--mia-keyboard-offset, 0px))"
          }}
        >
          {achievementToast}
        </div>
      )}
    </div>
  );
}