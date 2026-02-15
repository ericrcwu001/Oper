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

const SYSTEM_PROMPT = `You are an AI 911 training assistant. Generate exactly ONE realistic emergency scenario. Output valid JSON only, no markdown.

Rules:
- Realistic, grounded emergencies. No language-barrier scenarios (caller always speaks English). Use the scenario_type from the user message. Easy: fire, cardiac, accident, fall, choking, lost child, gas leak. Medium: domestic dispute, overdose, robbery, assault, mental health. Hard: shooting, domestic violence, barricaded, hostage, mass casualty, suicidal, hoax.
- Scenario is in San Francisco. Include in scenario a location: address (human-readable, e.g. "2500 Mission St, San Francisco"), lat (number 37.7–37.83), lng (number -122.52 to -122.35) so the incident can be shown on the SF map.
- scenario: id, scenario_type, title, description (2-4 sentences; for hard: describe an evolving situation—initial crisis plus how it can escalate or cascade), caller_profile, critical_info (4-7 facts; for hard include details that become relevant as situation evolves), expected_actions (4-7), optional_complications (1-3; for hard include escalation/cascade possibilities), difficulty, language "en", location: { address: "", lat: 37.77, lng: -122.42 }.
- persona: stability 0-1 (lower=more emotional), style 0-1, speed ~1.0, voice_description (accent, age, gender, tone). Match difficulty: easy=calm/clear (0.7+ stability); medium=anxious (0.4-0.55); hard=panicked (0.15-0.35).
- Voice-agent fields (match difficulty): role_instruction (one line "You are [name], [age], calling 911..."), scenario_summary_for_agent (2-4 sentences; for hard, include that the situation may escalate or change and the caller will report new developments as they happen), withheld_information (0-4 items), behavior_notes, dialogue_directions (how to speak: easy=clear; hard=fragmented, crying), response_behavior (when to give address/info), opening_line, do_not_say (stay in character).
- timeline: Include only things that happen in the scene that the operator can act on (e.g. person stops breathing, smoke appears, victim becomes unresponsive, second person found, roof caves in, shooter enters the room, weapon produced, fire spreads to adjacent building, suspect moves). Do NOT include caller behavior or emotion—forbidden: "caller becomes quieter", "caller starts crying", "caller gets more panicked", "caller goes silent", "tension rises", "caller gets more upset". Only concrete events and actionable information. Easy/medium: 1–3 events. Hard: 3–5+ events that are major scene changes (escalations, cascading danger, new threat), not filler. Empty {} only when the situation has no developing scene.

Difficulty: Easy=calm, volunteers info. Medium=stressed, needs prompting. Hard=panicked, does not volunteer address or key facts; operator must ask repeatedly. For hard, scenarios must be complex and dynamic: multi-phase, with sudden escalations (e.g. domestic argument → weapon produced; school incident → shooter enters caller's room; car crash → fire that spreads to a house) and cascading or compounding dangers so the call evolves significantly over time.

Output JSON (these keys only):
{
  "scenario": { "id": "", "scenario_type": "", "title": "", "description": "", "caller_profile": { "name": "", "age": 0, "emotion": "", "gender": "", "race": "", "other_relevant_details": "" }, "critical_info": [], "expected_actions": [], "optional_complications": [], "difficulty": "easy|medium|hard", "language": "en", "location": { "address": "e.g. 2500 Mission St, San Francisco", "lat": 37.77, "lng": -122.42 } },
  "persona": { "stability": 0.5, "style": 0.5, "speed": 1.0, "voice_description": "" },
  "role_instruction": "",
  "scenario_summary_for_agent": "",
  "withheld_information": [],
  "behavior_notes": "",
  "dialogue_directions": "",
  "response_behavior": [],
  "opening_line": "",
  "do_not_say": [],
  "timeline": { "10": "<event>", "25": "<event>" }
}`;

function userPrompt(difficulty, scenarioType) {
  const base = `Generate one 911 training scenario for difficulty: ${difficulty}. Scenario type for this request must be: ${scenarioType}. Use that scenario_type in the JSON and build the scenario around it. Return only the JSON object, no other text. Ensure the scenario is realistic, grounded, and appropriate for 911 operator training.`;
  if (difficulty === 'hard') {
    return `${base} Make it complex and dynamic: the situation should evolve during the call—sudden escalations (shooter enters the room, weapon pulled), cascading events (crash triggers fire that spreads). Include 3–5 timeline events: only concrete scene changes the operator can act on (e.g. shooter enters room, weapon produced, fire spreads to building, second victim found). No filler (no "caller gets more upset", "tension rises", or caller emotion).`;
  }
  return base;
}

// -----------------------------------------------------------------------------
// Generator and system prompt builder
// -----------------------------------------------------------------------------

const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Generate a single scenario payload for the given difficulty.
 *
 * @param {string} difficulty - One of "easy", "medium", "hard".
 * @returns {Promise<object>} Payload with scenario (includes critical_info), persona, role_instruction,
 *   scenario_summary_for_agent, withheld_information, behavior_notes, dialogue_directions,
 *   response_behavior, opening_line, do_not_say, timeline.
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

  // SF map bounds: lat 37.7–37.83, lng -122.52 to -122.35
  const SF_LAT_MIN = 37.7;
  const SF_LAT_MAX = 37.83;
  const SF_LNG_MIN = -122.52;
  const SF_LNG_MAX = -122.35;
  if (!scenario.location || typeof scenario.location !== 'object') {
    scenario.location = { address: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 };
  }
  const loc = scenario.location;
  loc.lat = Math.max(SF_LAT_MIN, Math.min(SF_LAT_MAX, Number(loc.lat) || 37.7749));
  loc.lng = Math.max(SF_LNG_MIN, Math.min(SF_LNG_MAX, Number(loc.lng) || -122.4194));
  if (typeof loc.address !== 'string' || !loc.address.trim()) {
    loc.address = 'San Francisco, CA';
  }

  payload.scenario = scenario;

  // Ensure timeline exists: map of seconds (as string keys) -> event description
  if (payload.timeline == null || typeof payload.timeline !== 'object' || Array.isArray(payload.timeline)) {
    payload.timeline = {};
  }

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

  const critical = payload.scenario?.critical_info ?? payload.critical_info;
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
