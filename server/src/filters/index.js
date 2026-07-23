// Orchestrates the two-stage fresher filter: Stage A (deterministic) first,
// Stage B (LLM) only for whatever Stage A can't resolve.
//
// classifyRole below is a second, fully independent gate (role taxonomy —
// config/roles.yaml) added alongside this one. The two never call into each
// other; pipeline.js composes them with AND. Do not merge their logic —
// see roleTier12.js's header comment for why they're kept separate.
//
// Both gates return a 3-way `verdict`, not just a boolean: 'include' /
// 'exclude' (a confident deterministic or LLM call) / 'unclear' (the LLM
// stage was unavailable, failed, or came back below-confidence). Per the
// spec's ambiguity policy, 'unclear' is never treated as 'exclude' —
// pipeline.js keeps these jobs (status: 'unclear') instead of silently
// dropping them; only a genuine 'exclude' verdict removes a job.
// `eligible` is kept for existing callers (scoring.js) as `verdict !== 'exclude'`.
import { evaluateStageA } from './stageA.js';
import { classifyWithLLM } from './stageB.js';
import { evaluateRoleTier12 } from './roleTier12.js';
import { classifyRoleWithLLM } from './roleTier3.js';
import { withLLMCache, ttlForVerdict } from '../llmCache.js';

// Below this confidence (or a fallback response, which always reports 0),
// the LLM's answer isn't trusted either way — 'unclear', not 'exclude'.
const LLM_UNCLEAR_THRESHOLD = 0.4;

// Narrows which role_type values count as a keep, independent of which tier
// (A or B) produced the verdict — mirrors config/india.yaml's locations.scope
// (a hard allow-list; empty/unset = no restriction). Only overrides a
// confident 'include' with a known role_type; an 'unclear'/'exclude' verdict,
// or an include with role_type null (couldn't be determined), passes through
// untouched — we only ever narrow a *confirmed* match, never guess at an
// unresolved one just to exclude it.
function applyRoleTypeScope(result, cfg) {
  const activeTypes = cfg.experience?.active_role_types;
  if (!activeTypes || !activeTypes.length) return result;
  if (result.verdict === 'include' && result.role_type && !activeTypes.includes(result.role_type)) {
    return {
      ...result,
      verdict: 'exclude',
      eligible: false,
      reason: `role type "${result.role_type}" not in active_role_types scope (${activeTypes.join(', ')})`,
    };
  }
  return result;
}

export async function classifyFresher(job, cfg) {
  const stageA = evaluateStageA(job, cfg);

  if (stageA.decision !== 'undecided') {
    return applyRoleTypeScope({
      eligible: stageA.decision === 'include',
      verdict: stageA.decision,
      min_years: stageA.min_years,
      max_years: stageA.max_years,
      role_type: stageA.role_type,
      confidence: stageA.confidence,
      low_confidence: stageA.low_confidence,
      reason: stageA.reason,
      stage: 'A',
    }, cfg);
  }

  // Cached by job id: without this, every 15-min background refresh
  // re-submits the same still-undecided job to Gemini, which is how a
  // 20-req/min free-tier quota gets exhausted almost instantly (see
  // llmCache.js).
  const stageB = await withLLMCache(`stageB:${job.id}`, () => classifyWithLLM(job, cfg), ttlForVerdict);
  const confidenceBand = stageB.confidence >= 0.7 ? 'high' : stageB.confidence >= 0.4 ? 'medium' : 'low';
  const verdict = stageB.confidence < LLM_UNCLEAR_THRESHOLD
    ? 'unclear'
    : (stageB.is_fresher_eligible ? 'include' : 'exclude');
  return applyRoleTypeScope({
    eligible: verdict !== 'exclude',
    verdict,
    min_years: stageB.min_years,
    max_years: stageB.max_years,
    role_type: stageB.role_type,
    confidence: confidenceBand,
    low_confidence: stageB.confidence < 0.5,
    reason: stageB.reason,
    stage: 'B',
  }, cfg);
}

// Narrows which role-taxonomy families count as a keep — mirrors
// applyRoleTypeScope above (config/roles.yaml's active_families, an
// allow-list on top of the full taxonomy; empty/unset = no restriction).
// Applies uniformly to a Tier 1/2 match or a Tier 3 (LLM) match, so the
// taxonomy file itself stays complete for whenever the scope is widened
// again — this only narrows what's currently active, it doesn't delete
// anything.
function applyFamilyScope(result, cfg) {
  const activeFamilies = cfg.roleTaxonomy?.active_families;
  if (!activeFamilies || !activeFamilies.length) return result;
  if (result.verdict === 'include' && result.family && !activeFamilies.includes(result.family)) {
    return {
      ...result,
      verdict: 'exclude',
      eligible: false,
      reason: `family "${result.family}" not in active_families scope (${activeFamilies.join(', ')})`,
    };
  }
  return result;
}

// Role-taxonomy gate: Tier 1/2 (deterministic) first, Tier 3 (LLM) only for
// whatever Tier 1/2 leaves 'undecided'. Returns
// {eligible, verdict, family, tier, has_data_signal, confidence, reason, stage}.
export async function classifyRole(job, cfg) {
  const tier12 = evaluateRoleTier12(job, cfg);

  if (tier12.decision !== 'undecided') {
    return applyFamilyScope({
      eligible: tier12.decision === 'include',
      verdict: tier12.decision,
      family: tier12.family,
      tier: tier12.tier,
      has_data_signal: tier12.has_data_signal,
      confidence: tier12.confidence,
      reason: tier12.reason,
      stage: 'tier12',
    }, cfg);
  }

  const tier3 = await withLLMCache(`tier3:${job.id}`, () => classifyRoleWithLLM(job, cfg), ttlForVerdict);
  const confidenceBand = tier3.confidence >= 0.7 ? 'high' : tier3.confidence >= 0.4 ? 'medium' : 'low';
  const verdict = tier3.confidence < LLM_UNCLEAR_THRESHOLD
    ? 'unclear'
    : (tier3.in_taxonomy ? 'include' : 'exclude');
  return applyFamilyScope({
    eligible: verdict !== 'exclude',
    verdict,
    family: tier3.family === 'none' ? null : tier3.family,
    tier: tier3.tier === 'none' ? null : tier3.tier,
    has_data_signal: tier3.has_data_signal,
    confidence: confidenceBand,
    reason: tier3.reason,
    stage: 'tier3',
  }, cfg);
}
