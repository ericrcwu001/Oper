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

/**
 * Build units array from LLM unitCounts (e.g. { Police: 5, SWAT: 1, EMT_BLS: 2, ALS: 1, Fire: 1 }).
 * @param {Record<string, number>} unitCounts
 * @param {Record<string, string>} rationales
 * @param {string} defaultSeverity
 * @returns {Array<{ unit: string, rationale?: string, severity?: string }>}
 */
function unitsFromCounts(unitCounts, rationales = {}, defaultSeverity = 'medium') {
  const units = [];
  for (const unitType of VALID_UNITS) {
    const n = Math.min(10, Math.max(0, Math.floor(Number(unitCounts?.[unitType]) || 0)));
    const rationale = typeof rationales?.[unitType] === 'string' ? rationales[unitType].trim() : undefined;
    for (let i = 0; i < n; i++) {
      units.push({ unit: unitType, rationale: rationale || undefined, severity: defaultSeverity });
    }
  }
  return units;
}
const VALID_STAGES = ['preliminary', 'confirming', 'confirmed'];

/**
 * Normalize LLM output into the exact shape the frontend expects.
 * Prefers unitCounts (LLM-generated counts) over legacy units array.
 * @param {unknown} parsed
 * @param {string} transcript
 * @returns {{ units: Array<{ unit: string, rationale?: string, severity?: string }>, severity: string, critical?: boolean, suggestedCount?: number, stage?: string, latestTrigger?: Array<{ rationale: string, severity: string }> }}
 */
function normalizeResponse(parsed, transcript) {
  const severity = VALID_SEVERITIES.includes(parsed.severity) ? parsed.severity : 'low';
  const critical = Boolean(parsed.critical);

  let units;
  if (parsed.unitCounts && typeof parsed.unitCounts === 'object') {
    units = unitsFromCounts(parsed.unitCounts, parsed.rationales || {}, severity);
  }
  if (!units?.length) {
    units = Array.isArray(parsed.units)
      ? parsed.units
          .filter((u) => u && typeof u === 'object' && typeof u.unit === 'string')
          .map((u) => ({
            unit: VALID_UNITS.includes(u.unit) ? u.unit : VALID_UNITS[0],
            rationale: typeof u.rationale === 'string' ? u.rationale.trim() : undefined,
            severity: VALID_SEVERITIES.includes(u.severity) ? u.severity : 'medium',
          }))
      : [];
  }
  if (!units.length) {
    units = [{ unit: 'EMT_BLS', rationale: 'Awaiting more information.', severity: 'low' }];
  }

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
    units,
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

  const systemPrompt = `${ragContext}You are an expert 911 dispatcher. Analyze the CALLER transcript from an ongoing emergency call and recommend how many units of each type to dispatch.

CRITICAL: Base your recommendations ONLY on what the caller has actually said. Do NOT use scenario context or external information. If details are sparse, recommend fewer units (preliminary stage).

Output a JSON object only, no other text. Use this exact structure:
{
  "unitCounts": {
    "Police": <0-10>,
    "SWAT": <0-10>,
    "EMT_BLS": <0-10>,
    "ALS": <0-10>,
    "Fire": <0-10>
  },
  "rationales": {
    "Police": "<short reason for police count>",
    "SWAT": "<short reason>",
    "EMT_BLS": "<short reason>",
    "ALS": "<short reason>",
    "Fire": "<short reason>"
  },
  "severity": "<low|medium|high|critical>",
  "critical": <true only if life-threatening or active violence>,
  "suggestedCount": <total units, or omit>,
  "latestTrigger": [
    { "rationale": "<what in the caller's words triggered this>", "severity": "<low|medium|high|critical>" }
  ]
}

Rules:
- unitCounts: How many of each unit type to send. Use 911 dispatch protocols:
  * Active shooter / mass shooting / hostage: 4-6 Police, 1-2 SWAT, 2-4 EMT_BLS, 1-2 ALS, 0-1 Fire (rescue support)
  * Structure fire: 2-3 Fire, 1-2 EMT_BLS, 1 ALS, 1 Police (traffic/scene)
  * Cardiac arrest / not breathing: 1-2 EMT_BLS, 1 ALS, 1 Fire (first responder with AED)
  * Shooting / person shot: 2-4 Police, 0-1 SWAT, 1-2 EMT_BLS, 1 ALS, 0 Fire
  * Domestic violence / assault: 2 Police, 0-1 EMT_BLS, 0-1 ALS, 0 Fire
  * Car accident with injuries: 1 Police, 1-2 EMT_BLS, 0-1 ALS, 0 Fire
  * Robbery / burglary: 1-2 Police, 0 medical, 0 Fire
  * Vague or minimal info: 0-1 of relevant types
- rationales: Brief reason per unit type (one sentence).
- severity: overall (low, medium, high, critical).
- critical: true for life-threatening or active violence.
- latestTrigger: 0-3 items from caller's most recent words.`;

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

  // Override severity/critical from priority (transcript classification) — unit counts come from LLM
  try {
    const priority = await getSituationPriority(text);
    const { suggestedCount: priorityCount, severity: prioritySeverity, critical: priorityCritical } =
      priorityToDispatch(priority);
    out.suggestedCount = priorityCount;
    out.severity = prioritySeverity;
    out.critical = priorityCritical;
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
