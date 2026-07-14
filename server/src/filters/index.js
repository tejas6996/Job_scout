// Orchestrates the two-stage fresher filter: Stage A (deterministic) first,
// Stage B (LLM) only for whatever Stage A can't resolve.
import { evaluateStageA } from './stageA.js';
import { classifyWithLLM } from './stageB.js';

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

  const stageB = await classifyWithLLM(job, cfg);
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
