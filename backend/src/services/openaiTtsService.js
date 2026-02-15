/**
 * OpenAI TTS (text-to-speech) for 911 caller audio.
 * Uses gpt-4o-mini-tts-2025-03-20 (marin/cedar voices). Voice by gender, speed and
 * short instructions from scenario for tone and emotion.
 *
 * Re-exports sanitizeCallerResponseText from elevenlabsService for shared use.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { config } from '../config.js';
import { sanitizeCallerResponseText } from './elevenlabsService.js';

export { sanitizeCallerResponseText };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Recommended voices for best quality (OpenAI docs). Gender maps to these. */
const VOICE_FEMALE = 'marin';
const VOICE_MALE = 'cedar';

/**
 * Scenario payload shape (subset) for voice/speed selection.
 * @typedef {{
 *   scenario?: { caller_profile?: { gender?: string, age?: number, emotion?: string, name?: string, [key: string]: unknown } };
 *   persona?: { speed?: number, stability?: number, [key: string]: unknown };
 * }} ScenarioVoicePayload
 */

/**
 * Picks marin (female) or cedar (male) from scenario payload. Recommended for best quality.
 *
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions - Legacy string or scenario payload.
 * @returns {string} OpenAI voice id: 'marin' or 'cedar'.
 */
function getOpenAIVoiceFromPayload(voiceOptions) {
  if (voiceOptions === undefined || voiceOptions === null) {
    return VOICE_MALE;
  }
  if (typeof voiceOptions === 'string') {
    const lower = voiceOptions.toLowerCase();
    const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'she', 'her ', 'mother', 'wife', 'daughter', 'women'];
    if (femaleKeywords.some((kw) => lower.includes(kw))) return VOICE_FEMALE;
    return VOICE_MALE;
  }
  if (typeof voiceOptions !== 'object') {
    return VOICE_MALE;
  }

  const scenario = voiceOptions.scenario || {};
  const profile = scenario.caller_profile || {};
  const gender = typeof profile.gender === 'string' ? profile.gender.trim().toLowerCase() : '';
  const persona = voiceOptions.persona || {};
  const voiceDesc = typeof persona.voice_description === 'string' ? persona.voice_description.toLowerCase() : '';

  const isFemale = (() => {
    const femaleValues = ['female', 'woman', 'girl', 'f'];
    if (gender && femaleValues.some((g) => gender === g || gender.startsWith(g))) return true;
    const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'mother', 'wife', 'daughter', 'she'];
    if (voiceDesc && femaleKeywords.some((kw) => voiceDesc.includes(kw))) return true;
    return false;
  })();

  return isFemale ? VOICE_FEMALE : VOICE_MALE;
}

/**
 * Resolves speech speed from persona and emotion so the caller sounds
 * panicked (faster), calm (normal/slightly slower), or stressed (moderate).
 *
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions - Scenario payload or legacy.
 * @returns {number} Speed in 0.25–4.0 (OpenAI range); default 1.0.
 */
function getSpeedFromPayload(voiceOptions) {
  const MIN = 0.25;
  const MAX = 4.0;
  const DEFAULT = 1.0;

  if (voiceOptions === undefined || voiceOptions === null || typeof voiceOptions === 'string') {
    return DEFAULT;
  }
  const persona = voiceOptions.persona || {};
  const profile = voiceOptions.scenario?.caller_profile || {};
  const emotion = typeof profile.emotion === 'string' ? profile.emotion.trim().toLowerCase() : '';
  const personaSpeed = typeof persona.speed === 'number' && !Number.isNaN(persona.speed) ? persona.speed : null;

  // Emotion-driven speed: panic/confusion = faster and more urgent for expressiveness.
  if (emotion) {
    const panicKeywords = ['panicked', 'panic', 'frantic', 'desperate', 'hysterical', 'terrified', 'confused', 'disoriented', 'overwhelmed'];
    const stressedKeywords = ['anxious', 'stressed', 'nervous', 'distraught', 'upset', 'scared', 'frightened'];
    if (panicKeywords.some((kw) => emotion.includes(kw))) {
      const speed = personaSpeed != null ? Math.min(MAX, personaSpeed * 1.2) : 1.35;
      return Math.max(MIN, Math.min(MAX, speed));
    }
    if (stressedKeywords.some((kw) => emotion.includes(kw))) {
      const speed = personaSpeed != null ? Math.min(MAX, personaSpeed * 1.1) : 1.15;
      return Math.max(MIN, Math.min(MAX, speed));
    }
    if (emotion.includes('calm') || emotion.includes('composed')) {
      const speed = personaSpeed != null ? personaSpeed : 0.95;
      return Math.max(MIN, Math.min(MAX, speed));
    }
  }

  if (personaSpeed != null) {
    return Math.max(MIN, Math.min(MAX, personaSpeed));
  }

  // Slight urgency by difficulty so easy/medium don't sound flat or overly calm
  const difficulty = voiceOptions.scenario?.difficulty || voiceOptions.difficulty;
  if (difficulty === 'medium') return Math.min(MAX, 1.1);
  if (difficulty === 'easy') return Math.min(MAX, 1.05);

  return DEFAULT;
}

/** Pinned model for natural pacing; supports instructions. Override with OPENAI_TTS_MODEL. */
const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts-2025-03-20';

/**
 * Short, clear instructions for tone and emotion. Used only with gpt-4o-mini-tts*.
 *
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions - Scenario payload or legacy.
 * @param {string} model - Current TTS model id.
 * @returns {string | undefined} Instructions string, or undefined if not supported.
 */
function getInstructionsFromPayload(voiceOptions, model) {
  if (!model || !model.startsWith('gpt-4o-mini-tts')) return undefined;

  if (voiceOptions === undefined || voiceOptions === null || typeof voiceOptions === 'string') {
    return 'Concerned, slightly worried. Not flat or robotic.';
  }

  const profile = voiceOptions.scenario?.caller_profile || {};
  const emotion = typeof profile.emotion === 'string' ? profile.emotion.trim().toLowerCase() : '';
  const difficulty = voiceOptions.scenario?.difficulty || voiceOptions.difficulty;

  const extremePanicKeywords = ['hysterical', 'terrified', 'desperate', 'frantic'];
  if (emotion && extremePanicKeywords.some((kw) => emotion.includes(kw))) {
    return 'Extreme panic. Breathless, urgent. Sometimes screaming or shouting. Confused and overwhelmed.';
  }
  const panicKeywords = ['panicked', 'panic', 'confused', 'disoriented', 'overwhelmed'];
  if (emotion && panicKeywords.some((kw) => emotion.includes(kw))) {
    return 'Panicked, breathless, urgent. Confused and overwhelmed.';
  }

  const stressedKeywords = ['anxious', 'stressed', 'nervous', 'distraught', 'upset', 'scared', 'frightened'];
  if (emotion && stressedKeywords.some((kw) => emotion.includes(kw))) {
    return 'Stressed and anxious. Worried, uneasy. Not calm or flat.';
  }

  if (difficulty === 'hard') return 'Panicked, breathless, urgent.';
  if (difficulty === 'medium') return 'Stressed and worried. Uneasy tone.';
  if (difficulty === 'easy') return 'Concerned and worried. Some urgency.';
  if (emotion.includes('calm') || emotion.includes('composed')) return 'Calm, steady, clear.';

  return 'Concerned, slightly worried. Not flat or robotic.';
}

/**
 * Converts text to speech using OpenAI TTS (gpt-4o-mini-tts-2025-03-20).
 * Voice: marin (female) or cedar (male). Speed and short instructions from scenario.
 *
 * @param {string} text - Dialog text to convert.
 * @param {string} filename - Output filename (e.g. "abc123.mp3").
 * @param {string | ScenarioVoicePayload | undefined} [voiceOptions] - Legacy string or scenario payload for voice/speed.
 * @returns {Promise<{ filePath: string, audioUrl: string }>}
 */
export async function textToSpeech(text, filename, voiceOptions) {
  const apiKey = config.openai?.apiKey;
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const cleanedText = sanitizeCallerResponseText(text);
  const voice = getOpenAIVoiceFromPayload(voiceOptions);
  const speed = getSpeedFromPayload(voiceOptions);
  const model = config.openai?.ttsModel || DEFAULT_TTS_MODEL;
  const instructions = getInstructionsFromPayload(voiceOptions, model);

  const openai = new OpenAI({ apiKey });
  const payload = {
    model,
    voice,
    input: cleanedText || '.',
    response_format: 'mp3',
    speed,
  };
  if (instructions) payload.instructions = instructions;

  const response = await openai.audio.speech.create(payload);

  const buffer = Buffer.from(await response.arrayBuffer());
  const projectRoot = path.join(__dirname, '..', '..');
  const outDir = path.join(projectRoot, config.generatedAudioDir);

  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  await fs.writeFile(filePath, buffer);

  const audioUrl = `${config.baseUrl.replace(/\/$/, '')}/${config.generatedAudioDir}/${path.basename(filename)}`;
  return { filePath, audioUrl };
}
