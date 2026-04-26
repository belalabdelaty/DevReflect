/**
 * DevReflect — Analytics Engine
 * Calculates independence scores, detects behavior patterns,
 * and produces session summaries.
 */

import { HEURISTICS, SCORE_THRESHOLDS } from "./constants.js";

/**
 * Calculate Independence Score (0–100).
 *
 * Formula: (timeBeforeAI / totalProblemTime) * 100
 * Adjusted for: query volume, copy-paste frequency, direct-to-AI behavior.
 *
 * @param {object} stats - Today's stats object
 * @param {object} session - Current session object
 * @returns {number} Score 0–100
 */
export function calculateIndependenceScore(stats, session) {
  const totalTime = stats.aiTime + stats.researchTime;

  if (totalTime === 0) return 100; // No activity tracked

  // Base formula
  const researchRatio = stats.researchTime / totalTime;
  let score = researchRatio * 100;

  // Penalty: instant reliance behavior
  const instantSessions = stats.sessions.filter(
    (s) => s.timeBeforeAI > 0 && s.timeBeforeAI < HEURISTICS.INSTANT_RELIANCE_THRESHOLD_MS
  ).length;
  score -= instantSessions * 8;

  // Penalty: high AI query volume (> 10 queries is a signal)
  if (stats.aiQueries > 10) {
    score -= Math.min((stats.aiQueries - 10) * 2, 20);
  }

  // Penalty: copy-paste from AI (signals low comprehension)
  if (stats.copyPasteFromAI > 0) {
    score -= Math.min(stats.copyPasteFromAI * 5, 25);
  }

  // Bonus: long research sessions before AI
  const goodAttempts = stats.sessions.filter(
    (s) => s.timeBeforeAI >= HEURISTICS.GOOD_ATTEMPT_THRESHOLD_MS
  ).length;
  score += goodAttempts * 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Classify the current behavior pattern.
 *
 * @param {object} session
 * @returns {string} pattern key
 */
export function classifyBehavior(session) {
  if (!session.firstAITime) return "exploring";

  const timeBeforeAI = session.firstAITime - session.startTime;

  if (timeBeforeAI < HEURISTICS.INSTANT_RELIANCE_THRESHOLD_MS) {
    return "instant_reliance";
  }
  if (timeBeforeAI < HEURISTICS.GOOD_ATTEMPT_THRESHOLD_MS) {
    return "quick_attempt";
  }
  if (timeBeforeAI < HEURISTICS.STRONG_ATTEMPT_THRESHOLD_MS) {
    return "good_attempt";
  }
  return "strong_attempt";
}

/**
 * Get a human-readable label and severity for a score.
 *
 * @param {number} score
 * @returns {{ label: string, level: string }}
 */
export function scoreToLabel(score) {
  if (score >= SCORE_THRESHOLDS.HIGH) {
    return { label: "Independent", level: "excellent" };
  }
  if (score >= SCORE_THRESHOLDS.MEDIUM) {
    return { label: "Balanced", level: "good" };
  }
  if (score >= SCORE_THRESHOLDS.LOW) {
    return { label: "AI-Reliant", level: "warning" };
  }
  if (score >= SCORE_THRESHOLDS.CRITICAL) {
    return { label: "Dependent", level: "danger" };
  }
  return { label: "AI-Dependent", level: "critical" };
}

/**
 * Produce a session summary to persist in today.sessions[].
 *
 * @param {object} session
 * @returns {object}
 */
export function buildSessionSummary(session) {
  const duration = Date.now() - session.startTime;
  const timeBeforeAI = session.firstAITime
    ? session.firstAITime - session.startTime
    : duration;

  return {
    id: session.id,
    startTime: session.startTime,
    endTime: Date.now(),
    duration,
    timeBeforeAI,
    usedAI: !!session.firstAITime,
    pattern: classifyBehavior(session),
  };
}

/**
 * Format milliseconds as a readable duration string.
 *
 * @param {number} ms
 * @returns {string} e.g. "4m 32s"
 */
export function formatDuration(ms) {
  if (ms < 1000) return "< 1s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/**
 * Compute a 7-day trend from history.
 * Returns +1 (improving), -1 (declining), 0 (stable).
 */
export function computeTrend(history) {
  if (!history || history.length < 2) return 0;
  const recent = history.slice(0, 3).reduce((a, d) => a + d.independenceScore, 0) / 3;
  const older = history.slice(3, 6).reduce((a, d) => a + d.independenceScore, 0) / 3;
  if (recent - older > 5) return 1;
  if (older - recent > 5) return -1;
  return 0;
}
