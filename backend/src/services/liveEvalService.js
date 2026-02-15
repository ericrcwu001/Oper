/**
 * Live call evaluation: LLM-based dispatch recommendations with RAG over ragDocs.
 * Returns the same response shape as the previous rule-based assess so the frontend is unchanged.
 */

import OpenAI from 'openai';
import { config } from '../config.js';
import { getRelevantContext } from './ragService.js';
import { getSituationPriority, priorityToDispatch } from './dispatchPriorityService.js';

const VALID_UNITS = ['EMT_BLS', 'ALS', 'Police', 'Fire', 'SWAT'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STAGES = ['preliminary', 'confirming', 'confirmed'];

/**
 * Normalize LLM output into the exact shape the frontend expects.
 * @param {unknown} parsed
 * @param {string} transcript
 * @returns {{ units: Array<{ unit: string, rationale?: string, severity?: string }>, severity: string, critical?: boolean, suggestedCount?: number, stage?: string, latestTrigger?: Array<{ rationale: string, severity: string }> }}
 */
function normalizeResponse(parsed, transcript) {
  const units = Array.isArray(parsed.units)
    ? parsed.units
        .filter((u) => u && typeof u === 'object' && typeof u.unit === 'string')
        .map((u) => ({
          unit: VALID_UNITS.includes(u.unit) ? u.unit : VALID_UNITS[0],
          rationale: typeof u.rationale === 'string' ? u.rationale.trim() : undefined,
          severity: VALID_SEVERITIES.includes(u.severity) ? u.severity : 'medium',
        }))
    : [];

  const severity = VALID_SEVERITIES.includes(parsed.severity) ? parsed.severity : 'low';
  const critical = Boolean(parsed.critical);
  let suggestedCount =
    typeof parsed.suggestedCount === 'number' && Number.isInteger(parsed.suggestedCount)
      ? Math.min(10, Math.max(1, parsed.suggestedCount))
      : undefined;

  const latestTrigger = Array.isArray(parsed.latestTrigger)
    ? parsed.latestTrigger
        .filter((t) => t && typeof t.rationale === 'string')
        .map((t) => ({
          rationale: String(t.rationale).trim().slice(0, 300),
          severity: VALID_SEVERITIES.includes(t.severity) ? t.severity : 'medium',
        }))
        .slice(0, 5)
    : undefined;

  const stage = VALID_STAGES.includes(parsed.stage) ? parsed.stage : undefined;

  return {
    units: units.length ? units : [{ unit: 'EMT_BLS', rationale: 'Awaiting more information.', severity: 'low' }],
    severity,
    critical,
    ...(suggestedCount != null && { suggestedCount }),
    ...(stage && { stage }),
    ...(latestTrigger && latestTrigger.length > 0 && { latestTrigger }),
  };
}

/**
 * Derive recommendation stage from transcript length (same logic as previous rule-based eval).
 * @param {string} transcript
 * @returns {'preliminary' | 'confirming' | 'confirmed'}
 */
function getStageFromTranscriptLength(transcript) {
  const len = (transcript || '').trim().length;
  if (len < 80) return 'preliminary';
  if (len < 220) return 'confirming';
  return 'confirmed';
}

/**
 * Call LLM to analyze caller transcript and return dispatch recommendations.
 * Uses RAG (ragDocs) to ground recommendations in 911 protocols.
 * IMPORTANT: Recommendations are based ONLY on the transcript—no scenario info (e.g. incident location).
 *
 * @param {string} transcript - Full caller-side transcript from the live call.
 * @param {{ resourceSummary?: string }} [options] - Deprecated. resourceSummary is NOT used (would leak scenario info). Kept for API compat.
 * @returns {Promise<{ units: Array<{ unit: string, rationale?: string, severity?: string }>, severity: string, critical?: boolean, suggestedCount?: number, stage?: string, latestTrigger?: Array<{ rationale: string, severity: string }>, resourceContextUsed?: string }>}
 */
export async function assessTranscriptWithLLM(transcript, options = {}) {
  if (!config.openai?.apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Live evaluation requires an API key.');
  }

  // Do NOT use resourceSummary—it comes from scenario incidentLocation and would leak scenario info.
  // Dispatch recommendations must be based ONLY on the transcript at the time.

  const text = (transcript || '').trim();
  let ragContext = '';
  try {
    ragContext = await getRelevantContext(text.slice(0, 4000));
    if (ragContext) ragContext = ragContext + '\n\n';
  } catch (err) {
    console.warn('Live eval RAG retrieval failed, continuing without reference docs:', err.message);
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const systemPrompt = `${ragContext}You are an expert 911 dispatcher. Analyze the CALLER transcript from an ongoing emergency call and recommend which units to dispatch.

CRITICAL: Base your recommendations ONLY on what the caller has actually said in the transcript. Do NOT use any scenario context, incident location, or external information. If the caller has not yet given an address or key details, reflect that in your recommendations (e.g. preliminary stage, fewer units). Use only the reference material above (if provided) to align with 911 protocols and best practices.

Output a JSON object only, no other text. Use this exact structure:
{
  "units": [
    { "unit": "<UnitType>", "rationale": "<short reason>", "severity": "<low|medium|high|critical>" }
  ],
  "severity": "<low|medium|high|critical>",
  "critical": <true only if life-threatening or active violence>,
  "suggestedCount": <number 1-5 if you can infer how many units, or omit>,
  "latestTrigger": [
    { "rationale": "<what in the caller's most recent words triggered this>", "severity": "<low|medium|high|critical>" }
  ]
}

Rules:
- unit must be exactly one of: EMT_BLS, ALS, Police, Fire, SWAT. Add one object per recommended unit type.
- severity: overall severity of the incident (low, medium, high, critical).
- critical: true only for life-threatening (e.g. not breathing, cardiac arrest) or active violence (shots fired, armed suspect).
- suggestedCount: optional; only include if the caller indicated number of victims/patients (e.g. "two people down" -> 2).
- latestTrigger: 0-3 items summarizing what in the caller's most recent statements (last sentence or two) drove the recommendation; use this so the UI can show "Just in" updates.`;

  const userPrompt = `CALLER TRANSCRIPT (operator has been speaking with this person; analyze for dispatch—use ONLY what the caller has said, no other context):\n\n${text || '(No transcript yet.)'}\n\nReturn the JSON object only.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('LLM returned no content for live evaluation.');

  const jsonStr = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error('LLM returned invalid JSON for live evaluation.');
  }

  const stage = getStageFromTranscriptLength(transcript);
  const out = normalizeResponse(parsed, transcript);
  if (!out.stage) out.stage = stage;

  // Override suggestedCount and severity from priority (transcript classification)
  try {
    const priority = await getSituationPriority(text);
    const { suggestedCount: priorityCount, severity: prioritySeverity, critical: priorityCritical } = priorityToDispatch(priority);
    out.suggestedCount = priorityCount;
    out.severity = prioritySeverity;
    out.critical = priorityCritical;
    // If LLM inferred more units from victim count (e.g. "five people shot"), use at least that many
    const llmCount =
      typeof parsed.suggestedCount === 'number' && Number.isInteger(parsed.suggestedCount)
        ? Math.min(10, Math.max(1, parsed.suggestedCount))
        : 0;
    if (llmCount > (out.suggestedCount ?? 0)) {
      out.suggestedCount = llmCount;
    }
  } catch (err) {
    console.warn('Dispatch priority override failed, using LLM response:', err.message);
  }

  return out;
}
