/**
 * Live call evaluation: LLM-based dispatch recommendations with RAG over ragDocs.
 * Returns the same response shape as the previous rule-based assess so the frontend is unchanged.
 */

import OpenAI from 'openai';
import { config } from '../config.js';
import { getRelevantContext } from './ragService.js';

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
 * Optionally includes a live resource snapshot (closest available units + ETA).
 *
 * @param {string} transcript - Full caller-side transcript from the live call.
 * @param {{ resourceSummary?: string }} [options] - Optional. resourceSummary: closest-available units and ETAs for the LLM.
 * @returns {Promise<{ units: Array<{ unit: string, rationale?: string, severity?: string }>, severity: string, critical?: boolean, suggestedCount?: number, stage?: string, latestTrigger?: Array<{ rationale: string, severity: string }>, resourceContextUsed?: string }>}
 */
export async function assessTranscriptWithLLM(transcript, options = {}) {
  if (!config.openai?.apiKey) {
    throw new Error('OPENAI_API_KEY is not set. Live evaluation requires an API key.');
  }

  const resourceSummary = typeof options.resourceSummary === 'string' ? options.resourceSummary : '';

  const text = (transcript || '').trim();
  let ragContext = '';
  try {
    ragContext = await getRelevantContext(text.slice(0, 4000));
    if (ragContext) ragContext = ragContext + '\n\n';
  } catch (err) {
    console.warn('Live eval RAG retrieval failed, continuing without reference docs:', err.message);
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const systemPrompt = `${ragContext}You are an expert 911 dispatcher. Analyze the CALLER transcript from an ongoing emergency call and recommend which units to dispatch. Use only the reference material above (if provided) to align with 911 protocols and best practices.

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

  let userPrompt = `CALLER TRANSCRIPT (operator has been speaking with this person; analyze for dispatch):\n\n${text || '(No transcript yet.)'}`;
  if (resourceSummary) {
    userPrompt += `\n\nLIVE RESOURCE SNAPSHOT (closest available units by distance and ETA):\n${resourceSummary}\n\nUse this to recommend specific units when appropriate and to state who is closest / ETA.`;
  }
  userPrompt += '\n\nReturn the JSON object only.';

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
  if (resourceSummary) out.resourceContextUsed = resourceSummary;
  return out;
}
