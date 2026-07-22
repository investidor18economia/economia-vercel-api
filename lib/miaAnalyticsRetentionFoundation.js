/**
 * PATCH 3.4 — Retention Foundation (derivation layer only).
 *
 * All retention metrics MUST be computed from analytics_events at query time.
 * No metric tables, caches, or snapshots.
 */

/** Public MIA events that participate in identity / retention timelines. */
export const RETENTION_IDENTITY_EVENTS = Object.freeze([
  "session_started",
  "user_authenticated",
  "mia_question_sent",
  "mia_recommendation_shown",
  "offer_click",
  "favorite_created",
  "price_alert_created",
]);

export const RETENTION_LIFECYCLE = Object.freeze({
  NEW: "new",
  RETURNING: "returning",
  REACTIVATED: "reactivated",
  ACTIVE: "active",
});

/** Default gap (days) between activity days to classify reactivation. */
export const RETENTION_REACTIVATION_GAP_DAYS = 7;

/**
 * @param {string|Date|null|undefined} value
 * @returns {number|null}
 */
export function toTimestampMs(value) {
  if (value == null) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * @param {number|null} ms
 * @returns {string|null} YYYY-MM-DD UTC
 */
export function toUtcDayKey(ms) {
  if (ms == null) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @returns {Array<Record<string, unknown>>}
 */
export function sortEventsChronologically(events = []) {
  return [...events].sort(
    (a, b) => (toTimestampMs(a.created_at) ?? 0) - (toTimestampMs(b.created_at) ?? 0)
  );
}

/**
 * Derive visitor-level identity timeline from ordered events.
 *
 * @param {Array<Record<string, unknown>>} events — same visitor_id
 */
export function deriveVisitorRetentionTimeline(events = []) {
  const ordered = sortEventsChronologically(events);
  const firstEvent = ordered[0] || null;
  const lastEvent = ordered[ordered.length - 1] || null;

  const firstSessionEvent =
    ordered.find((row) => row.session_id && row.event_name === "session_started") ||
    ordered.find((row) => row.session_id) ||
    null;

  const firstConversationEvent =
    ordered.find((row) => row.conversation_id && row.event_name === "mia_question_sent") ||
    ordered.find((row) => row.conversation_id) ||
    null;

  const firstAuthEvent =
    ordered.find((row) => row.user_id && row.event_name === "user_authenticated") ||
    ordered.find((row) => row.user_id) ||
    null;

  const activityDays = [
    ...new Set(
      ordered
        .map((row) => toUtcDayKey(toTimestampMs(row.created_at)))
        .filter(Boolean)
    ),
  ].sort();

  return {
    visitor_id: firstEvent?.visitor_id ?? null,
    first_activity_at: firstEvent?.created_at ?? null,
    last_activity_at: lastEvent?.created_at ?? null,
    first_active_day: activityDays[0] ?? null,
    last_active_day: activityDays[activityDays.length - 1] ?? null,
    active_day_count: activityDays.length,
    first_session_id: firstSessionEvent?.session_id ?? null,
    first_session_at: firstSessionEvent?.created_at ?? null,
    last_session_id: lastEvent?.session_id ?? null,
    first_conversation_id: firstConversationEvent?.conversation_id ?? null,
    first_conversation_at: firstConversationEvent?.created_at ?? null,
    last_conversation_id: lastEvent?.conversation_id ?? null,
    first_user_id: firstAuthEvent?.user_id ?? null,
    first_authenticated_at: firstAuthEvent?.created_at ?? null,
    last_user_id: [...ordered].reverse().find((row) => row.user_id)?.user_id ?? null,
    last_authenticated_at:
      [...ordered].reverse().find((row) => row.user_id)?.created_at ?? null,
  };
}

/**
 * @param {Array<Record<string, unknown>>} events — same user_id
 */
export function deriveUserRetentionTimeline(events = []) {
  const ordered = sortEventsChronologically(events.filter((row) => row.user_id));
  const first = ordered[0] || null;
  const last = ordered[ordered.length - 1] || null;
  const firstLogin =
    ordered.find((row) => row.event_name === "user_authenticated") || first;

  return {
    user_id: first?.user_id ?? null,
    first_login_at: firstLogin?.created_at ?? null,
    first_authenticated_event: firstLogin?.event_name ?? null,
    last_activity_at: last?.created_at ?? null,
    visitor_ids: [
      ...new Set(ordered.map((row) => row.visitor_id).filter(Boolean)),
    ],
  };
}

/**
 * Classify visitor lifecycle relative to evaluation day.
 *
 * @param {{
 *   first_active_day: string|null,
 *   last_active_day: string|null,
 *   active_day_count: number,
 * }} timeline
 * @param {string} evaluationDay — YYYY-MM-DD UTC
 * @param {{ reactivationGapDays?: number }} [options]
 */
export function classifyVisitorLifecycle(timeline, evaluationDay, options = {}) {
  const gapDays = options.reactivationGapDays ?? RETENTION_REACTIVATION_GAP_DAYS;
  if (!timeline?.first_active_day || !evaluationDay) {
    return RETENTION_LIFECYCLE.NEW;
  }

  if (timeline.first_active_day === evaluationDay && timeline.active_day_count <= 1) {
    return RETENTION_LIFECYCLE.NEW;
  }

  if (timeline.last_active_day === evaluationDay && timeline.first_active_day !== evaluationDay) {
    const lastMs = toTimestampMs(`${timeline.last_active_day}T00:00:00.000Z`);
    const prevDays = timeline.active_day_count >= 2;
    if (prevDays && lastMs != null) {
      const gapMs = gapDays * 24 * 60 * 60 * 1000;
      const priorActivityBeforeGap = timeline.active_day_count >= 2;
      if (priorActivityBeforeGap && timeline.last_active_day > timeline.first_active_day) {
        const daysBetween =
          (toTimestampMs(`${timeline.last_active_day}T00:00:00.000Z`) ?? 0) -
          (toTimestampMs(`${timeline.first_active_day}T00:00:00.000Z`) ?? 0);
        if (daysBetween >= gapMs) {
          return RETENTION_LIFECYCLE.REACTIVATED;
        }
      }
    }
    return RETENTION_LIFECYCLE.RETURNING;
  }

  if (timeline.last_active_day === evaluationDay) {
    return RETENTION_LIFECYCLE.ACTIVE;
  }

  return RETENTION_LIFECYCLE.RETURNING;
}

/**
 * Build grouped timelines for audit / dashboard prep.
 *
 * @param {Array<Record<string, unknown>>} events
 */
export function deriveRetentionFoundationFromEvents(events = []) {
  const byVisitor = new Map();
  const byUser = new Map();

  for (const row of events) {
    if (row.visitor_id) {
      const key = String(row.visitor_id);
      if (!byVisitor.has(key)) byVisitor.set(key, []);
      byVisitor.get(key).push(row);
    }
    if (row.user_id) {
      const key = String(row.user_id);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key).push(row);
    }
  }

  return {
    visitors: [...byVisitor.entries()].map(([visitorId, rows]) => ({
      visitor_id: visitorId,
      timeline: deriveVisitorRetentionTimeline(rows),
    })),
    users: [...byUser.entries()].map(([userId, rows]) => ({
      user_id: userId,
      timeline: deriveUserRetentionTimeline(rows),
    })),
  };
}
