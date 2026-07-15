// Orchestrates the two-stage fresher filter: Stage A (deterministic) first,
// Stage B (LLM) only for whatever Stage A can't resolve.
//
// classifyRole below is a second, fully independent gate (role taxonomy —
// config/roles.yaml) added alongside this one. The two never call into each
// other; pipeline.js composes them with AND. Do not merge their logic —
// see roleTier12.js's header comment for why they're kept separate.
import { evaluateStageA } from './stageA.js';
import { classifyWithLLM } from './stageB.js';
import { evaluateRoleTier12 } from './roleTier12.js';
import { classifyRoleWithLLM } from './roleTier3.js';
import { withLLMCache, ttlForVerdict } from '../llmCache.js';

export async function classifyFresher(job, cfg) {
  const stageA = evaluateStageA(job, cfg);

  if (stageA.decision !== 'undecided') {
    return {
      eligible: stageA.decision === 'include',
      min_years: stageA.min_years,
      max_years: stageA.max_years,
      role_type: stageA.role_type,
      confidence: stageA.confidence,
      low_confidence: stageA.low_confidence,
      reason: stageA.reason,
      stage: 'A',
    };
  }

  // Cached by job id: without this, every 15-min background refresh
  // re-submits the same still-undecided job to Gemini, which is how a
  // 20-req/min free-tier quota gets exhausted almost instantly (see
  // llmCache.js).
  const stageB = await withLLMCache(`stageB:${job.id}`, () => classifyWithLLM(job, cfg), ttlForVerdict);
  const confidenceBand = stageB.confidence >= 0.7 ? 'high' : stageB.confidence >= 0.4 ? 'medium' : 'low';
  return {
    eligible: stageB.is_fresher_eligible,
    min_years: stageB.min_years,
    max_years: stageB.max_years,
    role_type: stageB.role_type,
    confidence: confidenceBand,
    low_confidence: stageB.confidence < 0.5,
    reason: stageB.reason,
    stage: 'B',
  };
}

// Role-taxonomy gate: Tier 1/2 (deterministic) first, Tier 3 (LLM) only for
// whatever Tier 1/2 leaves 'undecided'. Returns
// {eligible, family, tier, has_data_signal, confidence, reason, stage}.
export async function classifyRole(job, cfg) {
  const tier12 = evaluateRoleTier12(job, cfg);

  if (tier12.decision !== 'undecided') {
    return {
      eligible: tier12.decision === 'include',
      family: tier12.family,
      tier: tier12.tier,
      has_data_signal: tier12.has_data_signal,
      confidence: tier12.confidence,
      reason: tier12.reason,
      stage: 'tier12',
    };
  }

  const tier3 = await withLLMCache(`tier3:${job.id}`, () => classifyRoleWithLLM(job, cfg), ttlForVerdict);
  const confidenceBand = tier3.confidence >= 0.7 ? 'high' : tier3.confidence >= 0.4 ? 'medium' : 'low';
  return {
    eligible: tier3.in_taxonomy,
    family: tier3.family === 'none' ? null : tier3.family,
    tier: tier3.tier === 'none' ? null : tier3.tier,
    has_data_signal: tier3.has_data_signal,
    confidence: confidenceBand,
    reason: tier3.reason,
    stage: 'tier3',
  };
}
