import OpenAI from 'openai';
import { config } from '../config.js';

/**
 * Evaluate operator performance from call transcript and notes using GPT-4o-mini.
 * Returns scores and feedback in the shape expected by the frontend.
 *
 * @param {Array<{ speaker: string, text: string, timestamp?: number }>} transcript
 * @param {Array<{ text: string, tag?: string, timestamp?: number }>} notes
 * @param {string} scenarioDescription
 * @returns {Promise<{ protocolAdherence: number, timeliness: number, criticalInfoCapture: number, overallScore: number, missedActions: string[], feedbackBullets: string[] }>}
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

  const systemPrompt = `You are an expert 911 dispatch trainer. Evaluate the operator's performance based on the call transcript and the notes they took.
Return a JSON object only, no other text, with this exact structure:
{
  "protocolAdherence": <number 0-100>,
  "timeliness": <number 0-100>,
  "criticalInfoCapture": <number 0-100>,
  "overallScore": <number 0-100>,
  "missedActions": [<string>, ...],
  "feedbackBullets": [<string>, ...],
  "transcriptHighlights": [
    { "turnIndex": <number>, "type": "missed_action" | "red_flag" | "improvement", "label": "<short string>", "detail": "<optional 1-2 sentences>" },
    ...
  ]
}
- protocolAdherence: Did they follow standard 911 protocol (location, nature of emergency, stay on line, dispatch, etc.)?
- timeliness: Did they gather key info and dispatch in a timely way?
- criticalInfoCapture: Did they capture critical info (address, injuries, hazards) and note it?
- overallScore: Overall performance (can be average of the three or your judgment).
- missedActions: 0-5 short strings describing what they should have done but didn't. Empty array if none.
- feedbackBullets: 2-5 short, constructive feedback sentences.
- transcriptHighlights: 0-8 items linking feedback to specific transcript turns. Use the number in brackets at the start of each transcript line as turnIndex (0-based). Focus on operator turns where they missed something, created a red flag, or where they could improve. type: "missed_action" = should have done something here; "red_flag" = concerning or risky; "improvement" = could have been better (softer). label: very short (e.g. "Ask for callback number"); detail: optional brief explanation. Only include highlights that clearly tie to one turn.`;

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
  const transcriptHighlights = Array.isArray(parsed.transcriptHighlights)
    ? parsed.transcriptHighlights
        .filter(
          (h) =>
            h &&
            typeof h.turnIndex === 'number' &&
            h.turnIndex >= 0 &&
            h.turnIndex < numTurns &&
            ['missed_action', 'red_flag', 'improvement'].includes(h.type)
        )
        .map((h) => ({
          turnIndex: h.turnIndex,
          type: h.type,
          label: String(h.label || '').trim() || 'Feedback',
          detail: h.detail != null ? String(h.detail).trim() : undefined,
        }))
    : [];

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
