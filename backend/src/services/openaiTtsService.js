/**
 * OpenAI TTS (text-to-speech) for 911 caller audio.
 * Uses tts-1 (fast, cheap) by default. Voice and speed are derived from
 * scenario payload so the caller expresses emotion (panic, etc.) and
 * reflects background (age, gender).
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

/** OpenAI TTS voice options. We map caller gender/age to these. */
const OPENAI_VOICES = {
  // More neutral / versatile
  alloy: 'alloy',
  echo: 'echo',
  fable: 'fable',
  onyx: 'onyx',
  nova: 'nova',
  shimmer: 'shimmer',
};

/** Female-leaning voices (for diversity we alternate by age). */
const FEMALE_VOICES = ['nova', 'shimmer'];
/** Male-leaning voices. */
const MALE_VOICES = ['alloy', 'onyx', 'echo'];

/**
 * Scenario payload shape (subset) for voice/speed selection.
 * @typedef {{
 *   scenario?: { caller_profile?: { gender?: string, age?: number, emotion?: string, name?: string, [key: string]: unknown } };
 *   persona?: { speed?: number, stability?: number, [key: string]: unknown };
 * }} ScenarioVoicePayload
 */

/**
 * Picks an OpenAI TTS voice from scenario payload to reflect caller background
 * (gender, age). Uses gender first, then age for variety (e.g. younger vs older).
 *
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions - Legacy string or scenario payload.
 * @returns {string} OpenAI voice id (alloy, echo, fable, onyx, nova, shimmer).
 */
function getOpenAIVoiceFromPayload(voiceOptions) {
  if (voiceOptions === undefined || voiceOptions === null) {
    return OPENAI_VOICES.alloy;
  }
  if (typeof voiceOptions === 'string') {
    const lower = voiceOptions.toLowerCase();
    const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'she', 'her ', 'mother', 'wife', 'daughter', 'women'];
    if (femaleKeywords.some((kw) => lower.includes(kw))) {
      return FEMALE_VOICES[0]; // nova
    }
    return MALE_VOICES[0]; // alloy
  }
  if (typeof voiceOptions !== 'object') {
    return OPENAI_VOICES.alloy;
  }

  const scenario = voiceOptions.scenario || {};
  const profile = scenario.caller_profile || {};
  const gender = typeof profile.gender === 'string' ? profile.gender.trim().toLowerCase() : '';
  const age = typeof profile.age === 'number' && !Number.isNaN(profile.age) ? profile.age : null;
  const persona = voiceOptions.persona || {};
  const voiceDesc = typeof persona.voice_description === 'string' ? persona.voice_description.toLowerCase() : '';

  const isFemale = (() => {
    const femaleValues = ['female', 'woman', 'girl', 'f'];
    if (gender && femaleValues.some((g) => gender === g || gender.startsWith(g))) return true;
    const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'mother', 'wife', 'daughter', 'she'];
    if (voiceDesc && femaleKeywords.some((kw) => voiceDesc.includes(kw))) return true;
    return false;
  })();

  const pool = isFemale ? FEMALE_VOICES : MALE_VOICES;
  // Use age to vary voice within pool (e.g. younger = first, older = second) for diversity.
  const index = age != null && age >= 50 ? 1 : 0;
  const voice = pool[index % pool.length];
  return OPENAI_VOICES[voice] || voice;
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

/** Model id that supports the `instructions` parameter for tone/emotion (only gpt-4o-mini-tts). */
const INSTRUCTIONS_CAPABLE_MODEL = 'gpt-4o-mini-tts';

/**
 * Builds natural-language instructions for TTS tone and emotion.
 * Only supported by gpt-4o-mini-tts; ignored for tts-1 / tts-1-hd.
 *
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions - Scenario payload or legacy.
 * @param {string} model - Current TTS model id.
 * @returns {string | undefined} Instructions string, or undefined if not supported / default tone.
 */
function getInstructionsFromPayload(voiceOptions, model) {
  if (model !== INSTRUCTIONS_CAPABLE_MODEL) return undefined;

  if (voiceOptions === undefined || voiceOptions === null || typeof voiceOptions === 'string') {
    return 'Speak with concern and light worry in your voice—not flat or robotic.';
  }

  const profile = voiceOptions.scenario?.caller_profile || {};
  const emotion = typeof profile.emotion === 'string' ? profile.emotion.trim().toLowerCase() : '';
  const difficulty = voiceOptions.scenario?.difficulty || voiceOptions.difficulty;

  // Panic / confused / desperate → strong emotional instruction
  const panicKeywords = ['panicked', 'panic', 'frantic', 'desperate', 'hysterical', 'terrified', 'confused', 'disoriented', 'overwhelmed'];
  if (emotion && panicKeywords.some((kw) => emotion.includes(kw))) {
    return 'Speak in a panicked, breathless tone. Sound confused, urgent, and emotionally overwhelmed. Use uneven pacing and heightened intensity—like someone in crisis.';
  }

  // Stressed / anxious
  const stressedKeywords = ['anxious', 'stressed', 'nervous', 'distraught', 'upset', 'scared', 'frightened'];
  if (emotion && stressedKeywords.some((kw) => emotion.includes(kw))) {
    return 'Speak with clear stress and anxiety. Worried, uneasy tone. Hesitant and emotionally engaged—not calm or flat.';
  }

  // Difficulty fallback when emotion is generic or missing
  if (difficulty === 'hard') {
    return 'Speak in a panicked, breathless tone. Sound confused and urgent. Uneven pacing, heightened emotion.';
  }
  if (difficulty === 'medium') {
    return 'Speak with clear stress and anxiety. Worried, uneasy tone. Hesitant and emotionally engaged—not calm or flat.';
  }
  if (difficulty === 'easy') {
    return 'Speak with concern and worry in your voice. You\'re upset about the situation—not calm or robotic. Some emotional weight and slight urgency.';
  }
  if (emotion.includes('calm') || emotion.includes('composed')) {
    return 'Speak calmly and clearly with a steady, composed tone.';
  }

  return 'Speak with concern and light worry in your voice—not flat or robotic.';
}

/**
 * Converts text to speech using OpenAI TTS (tts-1 by default).
 * Voice and speed reflect caller profile (gender, age) and emotion (panic, etc.).
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
  const model = config.openai?.ttsModel || 'tts-1';
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
