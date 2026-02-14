/**
 * Backend scenario generation for 911 operator training.
 *
 * Generates dynamic emergency scenarios (including edge/rare cases) from a difficulty
 * level using OpenAI Chat Completions. Output is structured for:
 * 1. Frontend (scenario metadata, caller_profile, critical_info, expected_actions, etc.)
 * 2. ElevenLabs Flash v2.5 voice agent: system prompt fields and persona for voice_settings.
 *
 * Use buildVoiceAgentSystemPrompt(payload) to produce the full system prompt string.
 */

import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import { config } from '../config.js';

// -----------------------------------------------------------------------------
// Scenario type pools (per difficulty) for diversity
// -----------------------------------------------------------------------------

const EASY_SCENARIO_TYPES = [
  'cardiac-arrest',
  'fire',
  'traffic-accident',
  'single-injury-fall',
  'bicycle-accident',
  'lost-child',
  'gas-leak',
  'animal-bite',
  'allergic-reaction',
  'choking',
];

const MEDIUM_SCENARIO_TYPES = [
  'domestic-dispute',
  'overdose',
  'stroke-or-seizure',
  'child-calling-for-parent',
  'elderly-fall',
  'assault-without-weapon',
  'car-breakdown-unsafe-area',
  'mental-health-crisis',
  'robbery-just-occurred',
  'structure-collapse',
];

const HARD_SCENARIO_TYPES = [
  'active-shooter',
  'shooting-witness',
  'domestic-violence',
  'barricaded-subject',
  'child-in-danger',
  'hostage',
  'mass-casualty',
  'suicidal-caller',
  'intoxicated-or-confused-caller',
  'hoax-or-prank',
];

const SCENARIO_TYPES_BY_DIFFICULTY = {
  easy: EASY_SCENARIO_TYPES,
  medium: MEDIUM_SCENARIO_TYPES,
  hard: HARD_SCENARIO_TYPES,
};

/**
 * Pick a random scenario type for the given difficulty. Used to ensure diverse
 * scenario types across requests (easy, medium, and hard).
 * @param {string} difficulty - One of "easy", "medium", "hard".
 * @returns {string} A scenario_type slug from the pool for that difficulty.
 */
function pickRandomScenarioType(difficulty) {
  const pool = SCENARIO_TYPES_BY_DIFFICULTY[difficulty];
  if (!pool || pool.length === 0) return 'traffic-accident';
  return pool[Math.floor(Math.random() * pool.length)];
}

// -----------------------------------------------------------------------------
// Prompts
// -----------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an AI 911 training assistant. Generate exactly ONE realistic emergency scenario for a trainee 911 operator. Your response must be valid JSON only, no markdown or extra text.

Requirements:
- Scenario must be realistic and grounded: plausible emergencies, correct protocols, no fantasy or inappropriate content.
- Vary scenario types for all difficulties; do not default to the same type (e.g. do not always use suicidal/self-harm for hard, or always cardiac/fire for easy). Do NOT use language-difficulty or language-barrier scenarios (e.g. caller does not speak English, medical emergency with language barrier, interpreter needed)—these are explicitly excluded from the possible scenario set. Easy: e.g. fire, cardiac arrest, traffic accident, fall, choking, lost child, gas leak, animal bite, allergic reaction. Medium: e.g. domestic dispute, overdose, child calling for parent, robbery, elderly fall, assault, mental health crisis, structure collapse. Hard: e.g. shooting/active threat, domestic violence, barricaded subject, child in danger, hostage, mass casualty, suicidal caller, intoxicated/confused caller, hoax. Scale detail and complications by difficulty (easy: fewer; hard: more stress, misreporting, or emotional volatility).
- Keep scenarios not overly complex: 4-7 critical_info items, 4-7 expected_actions, 1-3 optional_complications. Short descriptions and caller_script lines.
- Language is always English ("en").
- Caller profile must include personal details: name, age, emotion, gender, race, and optionally other_relevant_details (e.g. accent, first language, occupation if relevant to the scenario, physical description). Use these so the persona and voice agent can generate realistic, grounded dialogue.
- Caller persona must be aligned to ElevenLabs Flash v2.5 voice settings: provide stability (0-1 float, lower = more emotional range), style (0-1 float), speed (float e.g. 0.9-1.2), and voice_description (short text: accent, age, gender, emotional tone). These will be used for the voice agent system prompt and ElevenLabs API.
- Voice-agent fields: role_instruction (one short line, e.g. "You are [name], [age], calling 911 as..."), scenario_summary_for_agent (2-4 sentences ground truth the agent must know), critical_info (facts the caller should reveal when asked), withheld_information (details that require more probing and questioning from the operator to surface—NOT information the persona is purposely hiding from 911. These are contextual details that help the operator understand the situation better but only come out when the operator asks the right questions. Examples: after a crime, perpetrator height/race/clothing; layout of the room; whether anyone else is in the building. Include 1-4 items for medium/hard; easy may have 0-1.), behavior_notes (how caller may react, e.g. may become tearful, may misstate address once), dialogue_directions (explicit acting directions for how to speak: disfluencies like ums/uhs/pauses, false starts, volatility of language, sentence length; scale by difficulty—easy: minimal fillers, clear sentences; medium: some hesitation, repetition; hard: heavy disfluency, fragmented speech, emotional outbursts, crying), response_behavior (array of short instructions for how to react to the operator, e.g. "Give address only after being asked" or "Reveal suspect description when operator asks what they looked like"), opening_line (the first thing the caller says when the call connects; one short line), do_not_say (array of phrases or topics the caller would never say—stay in character; e.g. "I'm an AI", "What's the script?", breaking the fourth wall).

Difficulty drives how the caller persona behaves (tone, coherence, need for calming). Match persona and behavior_notes to these patterns:

- **Easy:** The caller gives information relatively calmly and accurately. They answer questions in order, speak clearly, and stay coherent. Persona: higher stability (e.g. 0.6-0.8), normal speed (e.g. 1.0), voice_description like "calm, clear, cooperative" or "composed, speaks in full sentences". behavior_notes: "Caller remains cooperative and follows operator guidance; may need minimal reassurance."

- **Medium:** The caller is stressed or worried but can still answer when prompted. Some hesitation or repeated details; may need brief reassurance to stay on track. Persona: moderate stability (e.g. 0.4-0.6), slightly faster speed (e.g. 1.0-1.1), voice_description like "anxious but coherent" or "worried, occasional hesitation". behavior_notes: "Caller may repeat themselves or need one or two prompts to give location; remains responsive to direct questions."

- **Hard:** The caller is panicked, emotional, or overwhelmed and often must be calmed before useful information can be given. May cry, speak in fragments, give information out of order, or fixate on one detail. Persona: lower stability (e.g. 0.2-0.45), faster or uneven speed (e.g. 1.1-1.3), voice_description like "panicked, breathless, needs calming" or "distraught, crying, speaks in bursts". behavior_notes: "Caller is highly emotional; operator may need to calmly repeat questions and reassure before getting location or key facts; may misstate details once or become tearful mid-call."

Output JSON with this exact structure (use these keys):
{
  "scenario": {
    "id": "<unique short id>",
    "scenario_type": "<use the scenario type specified in the user message; e.g. cardiac-arrest, fire, traffic-accident, shooting-witness, domestic-violence, suicidal-caller>",
    "title": "<short title>",
    "description": "<2-4 sentences>",
    "caller_profile": { "name": "<string>", "age": <number>, "emotion": "<string>", "gender": "<string>", "race": "<string>", "other_relevant_details": "<optional: accent, first language, occupation, etc.>" },
    "critical_info": ["<item>", ...],
    "expected_actions": ["<item>", ...],
    "optional_complications": ["<item>", ...],
    "difficulty": "easy" | "medium" | "hard",
    "language": "en"
  },
  "persona": {
    "stability": <0-1 float>,
    "style": <0-1 float>,
    "speed": <float>,
    "voice_description": "<short: accent, age, gender, emotional tone>"
  },
  "caller_script": ["<suggested caller line>", ...],
  "role_instruction": "<one short line for voice agent>",
  "scenario_summary_for_agent": "<2-4 sentences ground truth>",
  "critical_info": ["<fact to reveal when asked>", ...],
  "withheld_information": ["<detail that needs operator probing to surface—e.g. perpetrator height/race, room layout; NOT purposely hidden>", ...],
  "behavior_notes": "<optional complications / how caller may react>",
  "dialogue_directions": "<how to speak: disfluencies, pauses, volatility; match difficulty (easy=clear, hard=fragmented/emotional)>",
  "response_behavior": ["<how to react to operator, e.g. Give address only after being asked>", ...],
  "opening_line": "<first thing caller says when call connects>",
  "do_not_say": ["<phrase/topic caller would never say>", ...]
}`;

function userPrompt(difficulty, scenarioType) {
  return `Generate one 911 training scenario for difficulty: ${difficulty}. Scenario type for this request must be: ${scenarioType}. Use that scenario_type in the JSON and build the scenario around it. Return only the JSON object, no other text. Ensure the scenario is realistic, grounded, and appropriate for 911 operator training.`;
}

// -----------------------------------------------------------------------------
// Generator and system prompt builder
// -----------------------------------------------------------------------------

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Generate a single scenario payload for the given difficulty.
 *
 * @param {string} difficulty - One of "easy", "medium", "hard".
 * @returns {Promise<object>} Payload with scenario, persona, caller_script, role_instruction,
 *   scenario_summary_for_agent, critical_info, withheld_information, behavior_notes,
 *   dialogue_directions, response_behavior, opening_line, do_not_say.
 * @throws {Error} If OPENAI_API_KEY is missing, difficulty is invalid, or OpenAI API errors.
 */
export async function generateScenario(difficulty) {
  const normalized = difficulty?.trim?.().toLowerCase();
  if (!VALID_DIFFICULTIES.includes(normalized)) {
    throw new Error('difficulty must be one of: easy, medium, hard');
  }

  const apiKey = config.openai?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  const client = new OpenAI({ apiKey });
  const scenarioType = pickRandomScenarioType(normalized);

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.8,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt(normalized, scenarioType) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty response');
  }

  const payload = JSON.parse(content);
  const scenario = payload.scenario || {};

  if (!scenario.id) {
    scenario.id = `scenario-${randomUUID().slice(0, 8)}`;
  }
  if (scenario.language !== 'en') {
    scenario.language = 'en';
  }
  payload.scenario = scenario;

  return payload;
}

/**
 * Build a single system prompt string for the ElevenLabs Flash v2.5 voice agent
 * from the scenario generator payload.
 *
 * Sections: Role, Caller personal details, Scenario summary, Critical info,
 * Details that emerge with probing, Voice, Dialogue directions, Response behavior,
 * Opening line, Do not say, Behavioral notes.
 *
 * @param {object} payload - Result of generateScenario().
 * @returns {string} Full system prompt for the voice agent.
 */
export function buildVoiceAgentSystemPrompt(payload) {
  const parts = [];

  const role = payload.role_instruction || '';
  if (role) parts.push(`## Role\n${role}`);

  const scenario = payload.scenario || {};
  const callerProfile = scenario.caller_profile || {};
  const profileKeys = ['name', 'age', 'emotion', 'gender', 'race', 'other_relevant_details'];
  const profileParts = profileKeys
    .filter((key) => callerProfile[key] != null && callerProfile[key] !== '')
    .map((key) => `- ${key}: ${callerProfile[key]}`);
  if (profileParts.length) {
    parts.push(`## Caller personal details\n${profileParts.join('\n')}`);
  }

  const summary = payload.scenario_summary_for_agent || '';
  if (summary) parts.push(`## Scenario summary (ground truth)\n${summary}`);

  const critical = payload.critical_info;
  if (Array.isArray(critical) && critical.length) {
    parts.push(`## Critical information to convey (reveal when the operator asks; do not dump all at once)\n${critical.map((item) => `- ${item}`).join('\n')}`);
  }

  const withheld = payload.withheld_information;
  if (Array.isArray(withheld) && withheld.length) {
    const lines = withheld.map((item) => `- ${item}`).join('\n');
    parts.push(`## Details that emerge with operator probing\n${lines}\nThese are NOT things you are purposely hiding. They are contextual details that help the operator understand the situation better; they simply don't come up until the operator asks the right questions (e.g. suspect description, layout, who else is present). When the operator probes or asks relevant questions, provide these details naturally.`);
  }

  const persona = payload.persona || {};
  const voiceDesc = persona.voice_description || '';
  if (voiceDesc) parts.push(`## Voice / how to speak\nYou sound like: ${voiceDesc}`);

  const dialogueDir = payload.dialogue_directions || '';
  if (dialogueDir) parts.push(`## Dialogue / acting directions\n${dialogueDir}`);

  const responseBeh = payload.response_behavior;
  if (Array.isArray(responseBeh) && responseBeh.length) {
    parts.push(`## How to react to the operator\n${responseBeh.map((item) => `- ${item}`).join('\n')}`);
  }

  const opening = payload.opening_line || '';
  if (opening) parts.push(`## Opening line\nWhen the call connects, start with something like: "${opening}"`);

  const doNot = payload.do_not_say;
  if (Array.isArray(doNot) && doNot.length) {
    parts.push(`## Do NOT say (stay in character)\n${doNot.map((item) => `- ${item}`).join('\n')}`);
  }

  const behavior = payload.behavior_notes || '';
  if (behavior) parts.push(`## Behavioral notes\n${behavior}`);

  return parts.length ? parts.join('\n\n') : '';
}
