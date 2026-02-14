import OpenAI from 'openai';
import { config } from '../config.js';

/**
 * Generates emergency-caller dialog for a given scenario using OpenAI GPT.
 * Swap the scenario text dynamically by passing a different `scenario` string.
 *
 * @param {string} scenario - Description of the emergency (e.g. "Jack has fallen and broken his arm...")
 * @returns {Promise<string>} - The generated dialog text (caller's opening speech).
 */
export async function generateCallDialog(scenario) {
  if (!config.openai.apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const systemPrompt = `You are writing a short script for a 911 emergency call. 
The caller is a civilian reporting an emergency. Generate ONLY the caller's opening statement 
as they would say it when the operator answers – realistic, concise, and appropriate for the situation.

Make the speech sound natural and human under stress. Include:
- Brief pauses (use "..." or "—" where someone would hesitate or gasp)
- Occasional stutters or false starts (e.g. "I-I", "th-the", "h-he's not...")
- Fillers when fitting (e.g. "um", "uh", "oh god")
- Short repetitions or self-corrections (e.g. "He's not— he's not breathing")
- Slightly broken or run-on phrasing as in real panic, but keep it readable

Do not overdo it; one or two disfluencies per sentence is enough. Do not include operator lines or stage directions. Output plain text only, one paragraph.`;

  const userPrompt = `Scenario: ${scenario}\n\nGenerate the caller's opening statement.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 300,
  });

  const transcript = completion.choices[0]?.message?.content?.trim();
  if (!transcript) {
    throw new Error('OpenAI returned no dialog content.');
  }

  return transcript;
}

/**
 * Conversation entry for multi-turn interaction.
 * @typedef {{ role: 'caller' | 'operator', content: string }} ConversationTurn
 */

/**
 * Generates the next caller (AI) response given the scenario, conversation history,
 * and the operator's latest message. Keeps context intact for back-and-forth interaction.
 * Placeholder-friendly: scenario can be swapped for dynamic scenario input later.
 *
 * @param {string} scenario - Original emergency scenario (or dynamic scenario from future integration).
 * @param {ConversationTurn[]} conversationHistory - Previous turns (caller and operator).
 * @param {string} operatorMessage - Latest message from the operator (text or transcribed speech).
 * @returns {Promise<string>} - The next caller response text.
 */
export async function getNextCallerResponse(scenario, conversationHistory, operatorMessage) {
  if (!config.openai.apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const systemPrompt = `You are playing the role of a 911 caller in a training simulation. 
The following describes the emergency situation. Stay in character and respond as the caller would: 
realistic, emotional when appropriate, and concise.

Make each reply sound like natural speech under stress. Include when it fits:
- Brief pauses ("...", "—") where the caller would hesitate or get choked up
- Occasional stutters or false starts ("I-I don't know", "th-there's", "h-he")
- Fillers ("um", "uh", "oh god") and short repetitions or self-corrections
- Slightly broken phrasing, but keep the reply clear and readable

Do not overdo disfluencies; one or two per reply is enough. Do not include operator lines or stage directions. Output only the caller's reply as plain text.

Scenario: ${scenario}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map((turn) => ({
      role: turn.role === 'caller' ? 'assistant' : 'user',
      content: turn.role === 'caller' ? `[Caller] ${turn.content}` : `[Operator] ${turn.content}`,
    })),
    { role: 'user', content: `[Operator] ${operatorMessage}` },
  ];

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: 300,
  });

  const reply = completion.choices[0]?.message?.content?.trim();
  if (!reply) {
    throw new Error('OpenAI returned no caller response.');
  }

  return reply;
}
