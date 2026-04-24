/**
 * Lead Scoring Engine
 *
 * Calculates a score (0-100) based on:
 * - Deal value (up to 40 points)
 * - Interaction frequency (up to 30 points)
 * - Recency of last activity (up to 30 points)
 *
 * Temperature classification:
 * - Hot 🔥: score >= 70
 * - Warm ⚠️: score >= 40
 * - Cold ❄️: score < 40
 */

const MAX_DEAL_VALUE = 100000; // Benchmark for max deal value score

/**
 * Calculate score based on deal value
 * @param {number} dealValue
 * @returns {number} 0-40
 */
const scoreDealValue = (dealValue) => {
  if (!dealValue || dealValue <= 0) return 0;
  const score = Math.min((dealValue / MAX_DEAL_VALUE) * 40, 40);
  return Math.round(score);
};

/**
 * Calculate score based on interaction count
 * @param {number} interactionCount
 * @returns {number} 0-30
 */
const scoreInteractions = (interactionCount) => {
  if (!interactionCount || interactionCount <= 0) return 0;
  // 10+ interactions = max score
  const score = Math.min((interactionCount / 10) * 30, 30);
  return Math.round(score);
};

/**
 * Calculate score based on recency of last activity
 * @param {Date|null} lastActivityAt
 * @returns {number} 0-30
 */
const scoreRecency = (lastActivityAt) => {
  if (!lastActivityAt) return 0;

  const now = new Date();
  const daysSinceActivity = (now - new Date(lastActivityAt)) / (1000 * 60 * 60 * 24);

  if (daysSinceActivity <= 1) return 30;       // Active today/yesterday
  if (daysSinceActivity <= 7) return 25;       // Active this week
  if (daysSinceActivity <= 14) return 15;      // Active last 2 weeks
  if (daysSinceActivity <= 30) return 8;       // Active this month
  return 0;                                     // Inactive > 30 days
};

/**
 * Determine temperature category based on score
 * @param {number} score
 * @returns {'HOT'|'WARM'|'COLD'}
 */
const getTemperature = (score) => {
  if (score >= 70) return 'HOT';
  if (score >= 40) return 'WARM';
  return 'COLD';
};

/**
 * Calculate full lead score and temperature
 * @param {Object} lead - Lead object with dealValue, interactionCount, lastActivityAt
 * @returns {{ score: number, temperature: string }}
 */
const calculateLeadScore = (lead) => {
  const dealScore = scoreDealValue(lead.dealValue);
  const interactionScore = scoreInteractions(lead.interactionCount);
  const recencyScore = scoreRecency(lead.lastActivityAt);

  const totalScore = dealScore + interactionScore + recencyScore;
  const temperature = getTemperature(totalScore);

  return { score: totalScore, temperature };
};

module.exports = { calculateLeadScore, getTemperature };
