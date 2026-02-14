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
 * @returns {Promise<{ protocolAdherence: number, timeliness: number, criticalInfoCapture: number, overallScore: number, missedActions: string[], feedbackBullets: string[], transcriptHighlights: object[] }>}
 */
export async function evaluateCall(transcript, notes, scenarioDescription) {
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

  const systemPrompt = `${ragContext}You are an expert 911 dispatch trainer. Evaluate the operator's performance based on the call transcript and the notes they took.${ragContext ? ' Use the reference material above to align scores and feedback with established 911 operator protocols and best practices.' : ''}
Return a JSON object only, no other text, with this exact structure:
{
  "protocolAdherence": <number 0-100>,
  "timeliness": <number 0-100>,
  "criticalInfoCapture": <number 0-100>,
  "overallScore": <number 0-100>,
  "missedActions": [<string>, ...],
  "feedbackBullets": [<string>, ...],
  "transcriptHighlights": [
    { "turnIndex": <number>, "type": "missed_action" | "red_flag" | "improvement" | "good_move", "label": "<short string>", "detail": "<optional 1-2 sentences>" },
    ...
  ]
}
- protocolAdherence: Did they follow standard 911 protocol (location, nature of emergency, stay on line, dispatch, etc.)?
- timeliness: Did they gather key info and dispatch in a timely way?
- criticalInfoCapture: Did they capture critical info (address, injuries, hazards) and note it?
- overallScore: Overall performance (can be average of the three or your judgment).
- missedActions: 0-5 short strings describing what they should have done but didn't. Empty array if none.
- feedbackBullets: 2-5 short, constructive feedback sentences.
- transcriptHighlights: Link feedback to specific OPERATOR turns only. Use the number in brackets at the start of each transcript line as turnIndex (0-based). CRITICAL: Only use turnIndex for lines where the speaker is "operator"—never attach highlights to caller lines. Include both constructive and positive feedback. type: "missed_action" = should have done something here; "red_flag" = concerning or risky; "improvement" = could have been better (softer); "good_move" = something the operator did well (e.g. calm tone, got location, reassured caller). At most ONE negative highlight (missed_action or red_flag) per operator turn; you may include one improvement and one good_move per turn. label: very short; detail: optional. 0-10 items total.`;

  const userPrompt = `Scenario context: ${scenarioDescription}

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
    max_tokens: 900,
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
