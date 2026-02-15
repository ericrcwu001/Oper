import OpenAI from 'openai';
import { config } from '../config.js';

/** Default guidance when no difficulty is set. */
const DEFAULT_DIALOGUE_GUIDANCE = `Sound natural and clear. Use at most one brief pause or filler if it feels natural.`;

/**
 * Top-level dialogue guidance by difficulty (used when persona block may not override).
 * Hard mode must not say "prioritize clarity" so the caller stays incoherent until prompted.
 */
function getDifficultyGuidance(payload) {
  const d = payload?.scenario?.difficulty || payload?.difficulty;
  if (d === 'easy') {
    return 'Sound worried and concerned—you\'re upset about the emergency, not calm or flat. Give key details (location, what happened) without needing to be asked, but with real emotion, slight urgency, and maybe a few hesitations or fillers.';
  }
  if (d === 'hard') {
    return 'You are panicking and confused. Do NOT be clear or give critical info unless the operator asks directly. Use fragments, repetition, trailing off, "I don\'t know", "wait—", self-correction, and omission. Add a few natural disfluencies (um, uh, I mean)—not every sentence. Sound genuinely disoriented.';
  }
  if (d === 'medium') {
    return 'Sound clearly stressed and emotional. Hesitate, repeat yourself, lose your train of thought. Use natural disfluencies (um, uh, I mean). You may need the operator to refocus you; when you answer, still sound worried and uneven—not smooth or composed.';
  }
  return DEFAULT_DIALOGUE_GUIDANCE;
}

/**
 * Build persona-based instructions from scenarioGenerator payload for the system prompt.
 * @param {object} payload - Full scenario payload (scenario, persona, dialogue_directions, etc.)
 * @param {boolean} isOpening - True for opening statement only (use opening_line hint).
 * @returns {string} Extra system-prompt section or empty.
 */
function buildPersonaInstructions(payload, isOpening) {
  if (!payload || typeof payload !== 'object') return '';

  const parts = [];
  const role = payload.role_instruction;
  if (role) parts.push(`Role: ${role}`);

  const profile = payload.scenario?.caller_profile;
  if (profile && typeof profile === 'object') {
    const attrs = [profile.name, profile.age, profile.emotion, profile.gender].filter(Boolean);
    if (attrs.length) parts.push(`Caller: ${attrs.join(', ')}${profile.other_relevant_details ? ` (${profile.other_relevant_details})` : ''}`);
  }

  const difficulty = payload.scenario?.difficulty || payload.difficulty;
  const dialogueDir = payload.dialogue_directions;

  if (dialogueDir) {
    parts.push(`How to speak: ${dialogueDir}`);
  } else if (difficulty === 'easy') {
    parts.push(
      'How to speak: Worried and concerned—you\'re upset about what\'s happening, not calm or robotic. Give key details (location, what happened) without needing to be asked, but with real emotion: some urgency, maybe a few ums or hesitations, voice that shows you care. The operator should not have to prompt for basic info, but you should still sound like someone in an emergency, not a rehearsed script.'
    );
  } else if (difficulty === 'hard') {
    parts.push(
      'How to speak: You are panicking and confused. Speak in fragments, interrupt yourself, repeat the same phrase, say "I don\'t know" or "wait—" or "I can\'t—", trail off, correct yourself mid-sentence, cry or gasp. Use a few natural fillers (um, uh, I mean) and the occasional false start—not every sentence, so the operator can still follow. Do NOT volunteer the address or key facts—only give them when the operator explicitly asks (e.g. "What is your address?"). Focus on emotion or one detail; make the operator work to get location, what happened, and who is involved. Short, broken phrases; the operator must prompt repeatedly for critical information.'
    );
    parts.push(
      'When replying: Do NOT give address, exact location, or full details unless the operator asks directly. Answer only what was asked, and briefly. If they do not ask for the address, do not say it. If they ask "What is your emergency?" give a chaotic, confused, emotional answer that omits key facts so they have to ask follow-ups.'
    );
  } else {
    parts.push(
      'How to speak: Clearly anxious and stressed—emotionally engaged, not calm or flat. Hesitate, repeat yourself, lose your train of thought. Use natural disfluencies (um, uh, I mean) and maybe a false start. You can give important info when asked but may need the operator to refocus you; when you answer, still sound worried and uneven, not smooth or composed.'
    );
  }

  const behavior = payload.behavior_notes;
  if (behavior) parts.push(`Behavior: ${behavior}`);

  const responseBeh = payload.response_behavior;
  if (Array.isArray(responseBeh) && responseBeh.length) {
    parts.push('When replying: ' + responseBeh.slice(0, 4).join('; '));
  }

  if (isOpening && payload.opening_line) {
    parts.push(`Opening: Start with something like: "${payload.opening_line}" (expand naturally into one short paragraph, do not copy verbatim).`);
  }

  const doNot = payload.do_not_say;
  if (Array.isArray(doNot) && doNot.length) {
    parts.push('Do NOT say: ' + doNot.slice(0, 3).join('; '));
  }

  if (parts.length === 0) return '';
  return '\n\nCaller persona (match this):\n' + parts.map((p) => `- ${p}`).join('\n');
}

/**
 * Generates emergency-caller dialog for a given scenario using OpenAI GPT.
 * When personaPayload (scenarioGenerator format) is provided, dialogue is tailored to the caller's persona and difficulty.
 *
 * @param {string} scenario - Description of the emergency (and caller, if no payload).
 * @param {object} [personaPayload] - Optional full scenario payload (scenario, persona, dialogue_directions, opening_line, etc.)
 * @param {number} [callTimestampSeconds] - Optional seconds into the call (e.g. 0 for opening).
 * @param {string[]} [eventsSinceLastResponse] - Optional event descriptions that have occurred (e.g. from scenario timeline).
 * @returns {Promise<string>} - The generated dialog text (caller's opening speech).
 */
export async function generateCallDialog(
  scenario,
  personaPayload,
  callTimestampSeconds = 0,
  eventsSinceLastResponse = []
) {
  if (!config.openai.apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const personaBlock = buildPersonaInstructions(personaPayload, true);
  const guidance = getDifficultyGuidance(personaPayload);
  const timeContext =
    eventsSinceLastResponse.length > 0
      ? `\nCurrent moment in call: ${callTimestampSeconds} seconds. External events at this moment in the scene (if any): ${eventsSinceLastResponse.join('; ')}.`
      : '';
  const systemPrompt = `You are writing a short script for a 911 emergency call. 
The caller is a civilian reporting an emergency. Generate ONLY the caller's opening statement 
as they would say it when the operator answers – realistic, concise, and appropriate for the situation.

${guidance}
${personaBlock}

Do not include operator lines or stage directions. Output plain text only, one paragraph.`;

  const userPrompt = `Scenario: ${scenario}${timeContext}\n\nGenerate the caller's opening statement.`;

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
 * and the operator's latest message. When personaPayload is provided, reply style matches the caller's persona and dialogue_directions.
 *
 * @param {string} scenario - Original emergency scenario (text summary).
 * @param {ConversationTurn[]} conversationHistory - Previous turns (caller and operator).
 * @param {string} operatorMessage - Latest message from the operator (text or transcribed speech).
 * @param {object} [personaPayload] - Optional full scenario payload (scenario, persona, dialogue_directions, response_behavior, etc.)
 * @param {number|null} [callTimestampSeconds] - Optional seconds into the call.
 * @param {string[]} [eventsSinceLastResponse] - Optional event descriptions that occurred since the last caller response (from scenario timeline).
 * @returns {Promise<string>} - The next caller response text.
 */
export async function getNextCallerResponse(
  scenario,
  conversationHistory,
  operatorMessage,
  personaPayload,
  callTimestampSeconds = null,
  eventsSinceLastResponse = []
) {
  if (!config.openai.apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const personaBlock = buildPersonaInstructions(personaPayload, false);
  const guidance = getDifficultyGuidance(personaPayload);
  const timeContext =
    callTimestampSeconds != null || eventsSinceLastResponse.length > 0
      ? [
          callTimestampSeconds != null ? `Current time in call: ${callTimestampSeconds} seconds.` : '',
          eventsSinceLastResponse.length > 0
            ? `External events that just occurred in the scene (fixed timeline; weave into your response if relevant): ${eventsSinceLastResponse.join('; ')}.`
            : '',
        ]
          .filter(Boolean)
          .join(' ')
      : '';
  const systemPrompt = `You are playing the role of a 911 caller in a training simulation. 
The following describes the emergency situation. Stay in character and respond as the caller would: 
realistic, emotional when appropriate, and concise.

${guidance}
${personaBlock}

Do not include operator lines or stage directions. Output only the caller's reply as plain text.

Scenario: ${scenario}${timeContext ? `\n\n${timeContext}` : ''}`;

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

/**
 * Classify transcript into a short incident-type label for map display.
 * Uses ONLY the transcript text (caller's words); no scenario context.
 *
 * @param {string} transcript - Caller messages joined (what the caller has actually said so far).
 * @returns {Promise<string>} - 2–4 word label in ALL CAPS, e.g. "MASS SHOOTER", "HOSTAGE", "FIRE".
 */
export async function classifyTranscript(transcript) {
  const text = typeof transcript === 'string' ? transcript.trim() : '';
  if (!text) return '';

  if (!config.openai.apiKey) {
    return '';
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You classify 911 call transcripts into a short incident type. Output ONLY a 2–4 word label in ALL CAPS. Examples: MASS SHOOTER, HOSTAGE, FIRE, CAR ACCIDENT, DOMESTIC VIOLENCE, OVERDOSE, ROBBERY, HEART ATTACK. Base your answer ONLY on what the caller has said in the transcript—do not infer from context or scenario. If the transcript is too vague, output the best guess from the words spoken. Output nothing else.`,
      },
      {
        role: 'user',
        content: `Transcript:\n${text.slice(0, 2000)}`,
      },
    ],
    max_tokens: 30,
  });

  const label = completion.choices[0]?.message?.content?.trim();
  return label ? label.toUpperCase().replace(/\n/g, ' ') : '';
}
