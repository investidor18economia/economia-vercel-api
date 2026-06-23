export function getMiaSessionId() {
    if (typeof window === "undefined") return null;
  
    let sessionId = localStorage.getItem("mia_session_id");
  
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("mia_session_id", sessionId);
    }
  
    return sessionId;
  }
  
  export async function trackMiaEvent(eventName, payload = {}) {
    try {
      const sessionId = getMiaSessionId();
  
      await fetch("/api/analytics/track", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          event_name: eventName,
          session_id: sessionId,
          ...payload
        })
      });
    } catch (err) {
      console.warn("Analytics failed silently:", err);
    }
  }

  export function detectAnalyticsCategory(text = "") {
    const q = String(text).toLowerCase();
  
    if (/\b(celular|smartphone|iphone|galaxy|motorola|xiaomi|redmi|poco|realme)\b/.test(q)) {
      return "smartphones";
    }
  
    if (/\b(notebook|laptop|macbook|ultrabook)\b/.test(q)) {
      return "notebooks";
    }
  
    if (/\b(tv|televisão|televisao|smart tv|oled|qled)\b/.test(q)) {
      return "tv";
    }
  
    if (/\b(câmera|camera|canon|nikon|sony alpha|gopro)\b/.test(q)) {
      return "camera";
    }
  
    if (/\b(placa de vídeo|placa de video|gpu|rtx|gtx|radeon)\b/.test(q)) {
      return "placa_de_video";
    }
  
    if (/\b(fone|headphone|earbuds|airpods|galaxy buds)\b/.test(q)) {
      return "audio";
    }
  
    if (/\b(console|ps5|playstation|xbox|nintendo switch)\b/.test(q)) {
      return "games";
    }
  
    return "unknown";
  }

  export async function trackMiaSessionStarted() {
    if (typeof window === "undefined") return;
  
    const alreadyTracked = sessionStorage.getItem("mia_session_started_tracked");
  
    if (alreadyTracked) return;
  
    sessionStorage.setItem("mia_session_started_tracked", "true");
  
    await trackMiaEvent("session_started", {
      metadata: {
        page: window.location.pathname,
        user_agent: navigator.userAgent,
        referrer: document.referrer || null
      }
    });
  }