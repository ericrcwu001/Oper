import OpenAI from 'openai';
import { config } from '../config.js';
import { getRelevantContext } from './ragService.js';

/**
 * Evaluate operator performance from call transcript and notes using GPT-4o-mini.
 * Uses RAG over 911 operator reference docs (ragDocs) to ground scoring and feedback.
 *
 * @param {Array<{ speaker: string, text: string, timestamp?: number }>} transcript
 * @param {Array<{ text: string, tag?: string, timestamp?: number }>} notes
 * @param {string} scenarioDescription
 * @param {Record<string, string>} [scenarioTimeline] - Optional map of seconds (string keys) to fixed external event descriptions.
 * @param {string[]} [expectedActions] - Optional rubric of expected operator actions.
 * @param {string[]} [criticalInfo] - Optional rubric of critical info to capture.
 * @returns {Promise<{ protocolAdherence: number, timeliness: number, criticalInfoCapture: number, overallScore: number, missedActions: string[], feedbackBullets: string[], transcriptHighlights: object[] }>}
 */
export async function evaluateCall(transcript, notes, scenarioDescription, scenarioTimeline, expectedActions, criticalInfo) {
  if (!config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is not set.');
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const transcriptWithIndices = transcript
    .map((t, i) => `[${i}] [${t.speaker}] (${t.timestamp ?? '-'}s): ${t.text}`)
    .join('\n');
  const notesText =
    notes.length > 0
      ? notes
          .map((n) => `[${n.timestamp ?? '-'}s]${n.tag ? ` [${n.tag}]` : ''} ${n.text}`)
          .join('\n')
      : '(No notes taken)';

  const queryForRag = `${scenarioDescription}\n\nCall transcript excerpt:\n${transcriptWithIndices.slice(0, 3000)}`;
  let ragContext = '';
  try {
    ragContext = await getRelevantContext(queryForRag);
    if (ragContext) ragContext = ragContext + '\n\n';
  } catch (err) {
    console.warn('RAG retrieval failed, evaluating without reference docs:', err.message);
  }

  const rubricBlock =
    (Array.isArray(expectedActions) && expectedActions.length > 0) || (Array.isArray(criticalInfo) && criticalInfo.length > 0)
      ? `\n\nEXPECTED OPERATOR ACTIONS (check each):\n${(expectedActions || []).map((a) => `- ${a}`).join('\n')}\n\nCRITICAL INFORMATION TO CAPTURE (check each):\n${(criticalInfo || []).map((c) => `- ${c}`).join('\n')}\n\nScore against these rubrics. Each missed action or critical info item should lower the score.`
      : '';

  const systemPrompt = `${ragContext}You are an expert 911 dispatch trainer. Evaluate the operator's performance based on the call transcript and the notes they took. Be honest and strict. Do not inflate scores. Poor performance must receive low scores. Trainees need truthful feedback.${ragContext ? ' Use the reference material above to align scores and feedback with established 911 operator protocols and best practices.' : ''}

SCORING CALIBRATION (use strictly):
- Failing (overallScore 5-20): Operator said only a greeting ("hello", "hi", "911") or single short phrase; no location, nature, or actions. protocolAdherence 5-15, criticalInfoCapture 0-10, timeliness 5-15.
- Poor (15-35): Answered and maybe asked 1-2 vague questions; no location or nature captured.
- Below average (30-50): Got location OR nature of emergency, but not both; missed most critical info and expected actions.
- Average (50-65): Got location and nature; captured some critical info; missed several expected actions.
- Good (65-80): Most critical info captured; most expected actions done; minor gaps.
- Strong (80-90): Nearly all critical info; nearly all expected actions; clear notes.
- Excellent (90-100): Full protocol adherence; all critical info captured; all expected actions completed; caller kept calm and on line.

Per-dimension: protocolAdherence 0-20 = no location/nature/stay-on-line/dispatch; 30-50 = got location OR nature, not both; 60-80 = location and nature, most steps; 90-100 = full protocol. criticalInfoCapture 0-20 = none captured; 30-50 = 1-2 items; 60-80 = most; 90-100 = all. timeliness 0-20 = long delays, no urgency; 30-50 = asked non-urgent before critical; 60-80 = generally timely; 90-100 = prioritized location and nature early.
overallScore must reflect the weakest dimension when performance is poor—do not average up. A trainee who said only "hello" in a school shooter scenario must score 5-20 overall.

FEEDBACK REQUIREMENTS:
- feedbackBullets: 3-6 bullets. Each must be specific, actionable, and explain HOW to improve (not just what was wrong). If protocol adherence is low: explain how to adhere better (specific questions to ask, order of steps). If critical info capture is low: name which critical info was missed and suggest how to ask for it (e.g. "You didn't capture the number of victims. Ask: 'How many people are injured?'"). If timeliness is low: explain what to prioritize first. Avoid generic advice—the trainee should know exactly what to say or do differently.
- missedActions: 0-5 items. State what should have been done; optionally append brief "how" (e.g. "Dispatch police and EMS—you could have said 'I'm sending help now'").
- transcriptHighlights: For negative highlights (missed_action, red_flag), the "detail" field must explain what to do instead, not just that something was wrong (e.g. "At this point you should have asked: 'What is your exact address?' or 'What cross streets are you near?'").

Return a JSON object only, no other text, with this exact structure:
{
  "protocolAdherence": <number 0-100>,
  "timeliness": <number 0-100>,
  "criticalInfoCapture": <number 0-100>,
  "overallScore": <number 0-100>,
  "missedActions": [<string>, ...],
  "feedbackBullets": [<string>, ...],
  "transcriptHighlights": [
    { "turnIndex": <number>, "type": "missed_action" | "red_flag" | "improvement" | "good_move", "label": "<short string>", "detail": "<what to do instead for negative types; optional for good_move>" },
    ...
  ]
}
- transcriptHighlights: Link to OPERATOR turns only. Use the number in brackets at the start of each transcript line as turnIndex (0-based). Only use turnIndex for lines where speaker is "operator". At most ONE negative highlight per operator turn. 0-10 items total.`;

  const timelineBlock =
    scenarioTimeline &&
    typeof scenarioTimeline === 'object' &&
    !Array.isArray(scenarioTimeline) &&
    Object.keys(scenarioTimeline).length > 0
      ? `\n\nFixed scenario timeline (external events that occurred at these times during the call; consider whether the operator responded appropriately):\n${Object.entries(scenarioTimeline)
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([sec, desc]) => `  ${sec}s: ${typeof desc === 'string' ? desc.trim() : desc}`)
          .join('\n')}`
      : '';

  const userPrompt = `Scenario context: ${scenarioDescription}${timelineBlock}${rubricBlock}

CALL TRANSCRIPT (number in brackets is turnIndex for transcriptHighlights):
${transcriptWithIndices || '(No transcript)'}

OPERATOR NOTES DURING CALL:
${notesText}

Evaluate and return the JSON object only.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 1200,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('OpenAI returned no evaluation.');

  const json = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(json);

  const numTurns = transcript.length;
  const validTypes = ['missed_action', 'red_flag', 'improvement', 'good_move'];
  const isOperatorTurn = (i) => i >= 0 && i < numTurns && transcript[i].speaker === 'operator';

  let transcriptHighlights = Array.isArray(parsed.transcriptHighlights)
    ? parsed.transcriptHighlights
        .filter(
          (h) =>
            h &&
            typeof h.turnIndex === 'number' &&
            isOperatorTurn(h.turnIndex) &&
            validTypes.includes(h.type)
        )
        .map((h) => ({
          turnIndex: h.turnIndex,
          type: h.type,
          label: String(h.label || '').trim() || 'Feedback',
          detail: h.detail != null ? String(h.detail).trim() : undefined,
        }))
    : [];

  // At most one negative (missed_action or red_flag) per turn; keep first of each
  const negativePerTurn = new Set();
  transcriptHighlights = transcriptHighlights.filter((h) => {
    if (h.type === 'missed_action' || h.type === 'red_flag') {
      const key = h.turnIndex;
      if (negativePerTurn.has(key)) return false;
      negativePerTurn.add(key);
    }
    return true;
  });

  return {
    protocolAdherence: Math.min(100, Math.max(0, Number(parsed.protocolAdherence) || 0)),
    timeliness: Math.min(100, Math.max(0, Number(parsed.timeliness) || 0)),
    criticalInfoCapture: Math.min(100, Math.max(0, Number(parsed.criticalInfoCapture) || 0)),
    overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore) || 0)),
    missedActions: Array.isArray(parsed.missedActions) ? parsed.missedActions.map(String) : [],
    feedbackBullets: Array.isArray(parsed.feedbackBullets) ? parsed.feedbackBullets.map(String) : [],
    transcriptHighlights,
  };
}
