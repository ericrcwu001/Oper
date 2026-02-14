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

  const transcriptText = transcript
    .map((t) => `[${t.speaker}] (${t.timestamp ?? '-'}s): ${t.text}`)
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
  "feedbackBullets": [<string>, ...]
}
- protocolAdherence: Did they follow standard 911 protocol (location, nature of emergency, stay on line, dispatch, etc.)?
- timeliness: Did they gather key info and dispatch in a timely way?
- criticalInfoCapture: Did they capture critical info (address, injuries, hazards) and note it?
- overallScore: Overall performance (can be average of the three or your judgment).
- missedActions: 0-5 short strings describing what they should have done but didn't. Empty array if none.
- feedbackBullets: 2-5 short, constructive feedback sentences.`;

  const userPrompt = `Scenario context: ${scenarioDescription}

CALL TRANSCRIPT:
${transcriptText || '(No transcript)'}

OPERATOR NOTES DURING CALL:
${notesText}

Evaluate and return the JSON object only.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 500,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('OpenAI returned no evaluation.');

  const json = raw.replace(/^```json?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(json);

  return {
    protocolAdherence: Math.min(100, Math.max(0, Number(parsed.protocolAdherence) || 0)),
    timeliness: Math.min(100, Math.max(0, Number(parsed.timeliness) || 0)),
    criticalInfoCapture: Math.min(100, Math.max(0, Number(parsed.criticalInfoCapture) || 0)),
    overallScore: Math.min(100, Math.max(0, Number(parsed.overallScore) || 0)),
    missedActions: Array.isArray(parsed.missedActions) ? parsed.missedActions.map(String) : [],
    feedbackBullets: Array.isArray(parsed.feedbackBullets) ? parsed.feedbackBullets.map(String) : [],
  };
}
