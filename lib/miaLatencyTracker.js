/**
 * PATCH 7.3 — Lightweight request-scoped latency tracker (Date.now() wall clock).
 */

import { getSharedRequestState } from "./miaSharedRequestState.js";
import {
  MIA_LATENCY_STAGE_ORDER,
  MIA_LATENCY_STAGE_STATUSES,
  MIA_LATENCY_STAGES,
} from "./miaLatencyStageCatalog.js";

function normalizeDurationMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * @param {{ requestStartedAt?: number }} [options]
 */
export function createLatencyTracker(options = {}) {
  const requestStartedAt = Number(options.requestStartedAt) || Date.now();
  return {
    requestStartedAt,
    marks: {},
    providerAttempts: [],
    llmDurationMs: null,
    dataLayerDurationMs: null,
    responseReadyAt: null,
    emitted: false,
  };
}

/**
 * @param {ReturnType<typeof createLatencyTracker>|null|undefined} tracker
 * @param {string} stage
 * @param {{ status?: string, provider?: string|null, measurementAvailable?: boolean, limitationReason?: string|null }} [options]
 */
export function markLatencyStage(tracker, stage, options = {}) {
  if (!tracker || !stage) return;
  tracker.marks[stage] = {
    atMs: Date.now(),
    status: options.status || MIA_LATENCY_STAGE_STATUSES.OK,
    provider: options.provider ?? null,
    measurementAvailable: options.measurementAvailable !== false,
    limitationReason: options.limitationReason ?? null,
  };
}

/**
 * @param {ReturnType<typeof createLatencyTracker>|null|undefined} tracker
 * @param {{ provider?: string, durationMs?: number, status?: string }} attempt
 */
export function recordProviderLatencyAttempt(tracker, attempt = {}) {
  if (!tracker) return;
  const durationMs = normalizeDurationMs(attempt.durationMs);
  if (durationMs == null) return;
  tracker.providerAttempts.push({
    provider: attempt.provider || "unknown",
    duration_ms: durationMs,
    status: attempt.status || MIA_LATENCY_STAGE_STATUSES.OK,
  });
}

/**
 * @param {ReturnType<typeof createLatencyTracker>|null|undefined} tracker
 * @param {number|null|undefined} pipelineStartedAt
 */
export function recordDataLayerStageLatency(tracker, pipelineStartedAt) {
  if (!tracker || pipelineStartedAt == null) return;
  const durationMs = normalizeDurationMs(Date.now() - Number(pipelineStartedAt));
  if (durationMs == null) return;
  tracker.dataLayerDurationMs = durationMs;
  markLatencyStage(tracker, MIA_LATENCY_STAGES.DATA_LAYER, {
    status: MIA_LATENCY_STAGE_STATUSES.OK,
    measurementAvailable: true,
  });
}

/**
 * @param {ReturnType<typeof createLatencyTracker>|null|undefined} tracker
 * @param {number} durationMs
 */
export function recordLlmLatency(tracker, durationMs) {
  if (!tracker) return;
  const normalized = normalizeDurationMs(durationMs);
  if (normalized == null) return;
  tracker.llmDurationMs =
    tracker.llmDurationMs == null ? normalized : Math.max(tracker.llmDurationMs, normalized);
  markLatencyStage(tracker, MIA_LATENCY_STAGES.LLM, {
    status: MIA_LATENCY_STAGE_STATUSES.OK,
    measurementAvailable: true,
  });
}

/** Called from lib/openai.js — fire-and-forget, never throws. */
export function tryRecordLlmDuration(durationMs) {
  try {
    const state = getSharedRequestState();
    if (state?.latencyAnalytics) {
      recordLlmLatency(state.latencyAnalytics, durationMs);
    }
  } catch {
    // observational only
  }
}

/**
 * @param {ReturnType<typeof createLatencyTracker>|null|undefined} tracker
 */
export function markResponseReady(tracker) {
  if (!tracker) return;
  tracker.responseReadyAt = Date.now();
  markLatencyStage(tracker, MIA_LATENCY_STAGES.RESPONSE_BUILDER, {
    status: MIA_LATENCY_STAGE_STATUSES.OK,
    measurementAvailable: true,
  });
}

function buildExclusiveSegmentDuration(tracker, stage, previousAtMs) {
  const mark = tracker.marks[stage];
  if (!mark?.atMs) {
    return {
      stage,
      duration_ms: null,
      status: MIA_LATENCY_STAGE_STATUSES.UNAVAILABLE,
      provider: null,
      measurement_available: false,
      limitation_reason: "stage_not_marked_on_path",
    };
  }
  const durationMs = normalizeDurationMs(mark.atMs - previousAtMs);
  return {
    stage,
    duration_ms: durationMs,
    status: mark.status || MIA_LATENCY_STAGE_STATUSES.OK,
    provider: mark.provider ?? null,
    measurement_available: mark.measurementAvailable !== false,
    limitation_reason: mark.limitationReason ?? null,
  };
}

/**
 * Build stages array + total_duration_ms for analytics emit.
 *
 * @param {ReturnType<typeof createLatencyTracker>|null|undefined} tracker
 */
export function finalizeLatencyMeasurement(tracker) {
  if (!tracker) {
    return { total_duration_ms: null, stages: [], measurement_gaps: [] };
  }

  const responseReadyAt = tracker.responseReadyAt || Date.now();
  const totalDurationMs = normalizeDurationMs(responseReadyAt - tracker.requestStartedAt);

  const stages = [];
  let previousAtMs = tracker.requestStartedAt;

  for (const stage of MIA_LATENCY_STAGE_ORDER) {
    if (stage === MIA_LATENCY_STAGES.PROVIDER && tracker.providerAttempts.length > 0) {
      const providerTotal = tracker.providerAttempts.reduce(
        (sum, item) => sum + (item.duration_ms || 0),
        0
      );
      stages.push({
        stage: MIA_LATENCY_STAGES.PROVIDER,
        duration_ms: normalizeDurationMs(providerTotal),
        status: MIA_LATENCY_STAGE_STATUSES.OK,
        provider:
          tracker.providerAttempts.length === 1
            ? tracker.providerAttempts[0].provider
            : "multi",
        measurement_available: true,
        limitation_reason: null,
        attempts: tracker.providerAttempts.slice(0, 10),
      });
      continue;
    }

    if (stage === MIA_LATENCY_STAGES.LLM && tracker.llmDurationMs != null) {
      stages.push({
        stage: MIA_LATENCY_STAGES.LLM,
        duration_ms: tracker.llmDurationMs,
        status: MIA_LATENCY_STAGE_STATUSES.OK,
        provider: "openai",
        measurement_available: true,
        limitation_reason: null,
      });
      continue;
    }

    if (stage === MIA_LATENCY_STAGES.DATA_LAYER && tracker.dataLayerDurationMs != null) {
      stages.push({
        stage: MIA_LATENCY_STAGES.DATA_LAYER,
        duration_ms: tracker.dataLayerDurationMs,
        status: MIA_LATENCY_STAGE_STATUSES.OK,
        provider: null,
        measurement_available: true,
        limitation_reason: null,
      });
      continue;
    }

    const segment = buildExclusiveSegmentDuration(tracker, stage, previousAtMs);
    stages.push(segment);
    if (segment.measurement_available && segment.duration_ms != null && tracker.marks[stage]?.atMs) {
      previousAtMs = tracker.marks[stage].atMs;
    }
  }

  stages.push({
    stage: MIA_LATENCY_STAGES.TOTAL,
    duration_ms: totalDurationMs,
    status: MIA_LATENCY_STAGE_STATUSES.OK,
    provider: null,
    measurement_available: totalDurationMs != null,
    limitation_reason: totalDurationMs == null ? "total_unavailable" : null,
  });

  const measurementGaps = stages
    .filter((s) => s.measurement_available === false && s.stage !== MIA_LATENCY_STAGES.AUTH)
    .map((s) => s.stage);

  return {
    total_duration_ms: totalDurationMs,
    stages,
    measurement_gaps: measurementGaps,
  };
}

export function buildLatencyDedupKey(requestId, eventName, eventVersion) {
  return `${requestId || "unknown"}|${eventName}|${eventVersion}`;
}
