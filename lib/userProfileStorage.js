const PROFILE_PREFIX = "mia_user_profile_";

export function loadUserProfile(userId) {
  if (!userId || typeof window === "undefined") {
    return { displayName: "", photoDataUrl: "" };
  }

  try {
    const raw = window.localStorage.getItem(`${PROFILE_PREFIX}${userId}`);
    if (!raw) return { displayName: "", photoDataUrl: "" };
    const parsed = JSON.parse(raw);
    return {
      displayName: String(parsed.displayName || "").trim(),
      photoDataUrl: String(parsed.photoDataUrl || "").trim(),
    };
  } catch {
    return { displayName: "", photoDataUrl: "" };
  }
}

export function saveUserProfile(userId, profile = {}) {
  if (!userId || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      `${PROFILE_PREFIX}${userId}`,
      JSON.stringify({
        displayName: String(profile.displayName || "").trim(),
        photoDataUrl: String(profile.photoDataUrl || "").trim(),
      })
    );
  } catch {
    /* quota / private mode */
  }
}

export function loadStoredUser() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("mia_user");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredUser(user) {
  if (!user || typeof window === "undefined") return;

  try {
    window.localStorage.setItem("mia_user", JSON.stringify(user));
  } catch {
    /* noop */
  }
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem("mia_user");
  } catch {
    /* noop */
  }
}
