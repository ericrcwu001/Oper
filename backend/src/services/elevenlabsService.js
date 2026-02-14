import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Strip all leading speaker labels so TTS does not read them aloud.
 * Handles multiple occurrences (e.g. "[Caller] [Caller] Hello" -> "Hello").
 * @param {string} text
 * @returns {string}
 */
function sanitizeForTts(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/^\s*(\[?(?:Caller|Operator)\]?\s*:?\s*)+/i, '')
    .trim();
}

/**
 * Scenario JSON format from scenarioGenerator.js (or minimal subset for voice selection).
 * Used to pick voice ID and optional voice_settings (stability, style, speed).
 * @typedef {{
 *   scenario?: { caller_profile?: { gender?: string, [key: string]: unknown } };
 *   persona?: { stability?: number, style?: number, speed?: number, voice_description?: string };
 * }} ScenarioVoicePayload
 */

/**
 * Picks a voice ID from a scenario generator payload using scenario.caller_profile.gender
 * and optionally persona.voice_description as fallback.
 *
 * @param {ScenarioVoicePayload} payload - Scenario JSON from scenarioGenerator (or subset).
 * @returns {string} voiceId to use for TTS.
 */
function getVoiceIdFromScenarioPayload(payload) {
  const { voiceId, voiceIdFemale } = config.elevenlabs;
  if (!payload || typeof payload !== 'object') {
    return voiceId;
  }

  const scenario = payload.scenario || {};
  const callerProfile = scenario.caller_profile || {};
  const gender = typeof callerProfile.gender === 'string' ? callerProfile.gender.trim().toLowerCase() : '';

  if (gender && voiceIdFemale) {
    const femaleValues = ['female', 'woman', 'girl', 'f'];
    if (femaleValues.some((g) => gender === g || gender.startsWith(g))) {
      return voiceIdFemale;
    }
  }

  // Fallback: infer from persona.voice_description (e.g. "calm middle-aged woman")
  const persona = payload.persona || {};
  const voiceDesc = typeof persona.voice_description === 'string' ? persona.voice_description.toLowerCase() : '';
  if (voiceDesc && voiceIdFemale) {
    const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'mother', 'wife', 'daughter', 'she'];
    if (femaleKeywords.some((kw) => voiceDesc.includes(kw))) {
      return voiceIdFemale;
    }
  }

  return voiceId;
}

/**
 * Builds ElevenLabs voice_settings from scenario generator persona (stability, style, speed).
 * Clamps values to valid ranges. Omitted or invalid fields are left undefined so API uses defaults.
 *
 * @param {ScenarioVoicePayload} payload - Scenario JSON from scenarioGenerator (or subset).
 * @returns {{ stability?: number, style?: number, speed?: number, similarity_boost?: number }}
 */
function getVoiceSettingsFromScenarioPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  const persona = payload.persona || {};
  const out = {};

  const stability = persona.stability;
  if (typeof stability === 'number' && !Number.isNaN(stability)) {
    out.stability = Math.max(0, Math.min(1, stability));
  }
  const style = persona.style;
  if (typeof style === 'number' && !Number.isNaN(style)) {
    out.style = Math.max(0, Math.min(1, style));
  }
  const speed = persona.speed;
  if (typeof speed === 'number' && !Number.isNaN(speed)) {
    out.speed = Math.max(0.5, Math.min(2, speed));
  }
  return out;
}

/**
 * Resolves voice ID from either legacy caller description string or scenario JSON payload.
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions - Caller description (string) or scenario payload (object).
 * @returns {string} voiceId.
 */
function resolveVoiceId(voiceOptions) {
  if (voiceOptions === undefined || voiceOptions === null) {
    return config.elevenlabs.voiceId;
  }
  if (typeof voiceOptions === 'string') {
    const { voiceId, voiceIdFemale } = config.elevenlabs;
    if (!voiceIdFemale) return voiceId;
    const lower = voiceOptions.toLowerCase();
    const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'she', 'her ', 'mother', 'wife', 'daughter', 'women'];
    if (femaleKeywords.some((kw) => lower.includes(kw))) {
      return voiceIdFemale;
    }
    return voiceId;
  }
  if (typeof voiceOptions === 'object' && voiceOptions !== null) {
    return getVoiceIdFromScenarioPayload(voiceOptions);
  }
  return config.elevenlabs.voiceId;
}

/**
 * Resolves voice_settings from scenario payload. Returns {} for string/undefined.
 * @param {string | ScenarioVoicePayload | undefined} voiceOptions
 * @returns {{ stability?: number, style?: number, speed?: number, similarity_boost?: number }}
 */
function resolveVoiceSettings(voiceOptions) {
  if (voiceOptions === undefined || voiceOptions === null || typeof voiceOptions === 'string') {
    return {};
  }
  if (typeof voiceOptions === 'object' && voiceOptions !== null) {
    return getVoiceSettingsFromScenarioPayload(voiceOptions);
  }
  return {};
}

/**
 * Converts transcript text to speech using ElevenLabs TTS and saves to a file.
 * Returns the path to the saved file (relative to project root) and the public URL.
 *
 * @param {string} text - The dialog text to convert to speech.
 * @param {string} filename - Output filename (e.g. "abc123.mp3").
 * @param {string | ScenarioVoicePayload | undefined} [voiceOptions] - Optional. Either:
 *   - Legacy: string (caller description) → used only to pick voice ID (e.g. female vs default).
 *   - Scenario format: object from scenarioGenerator with scenario.caller_profile and persona
 *     → voice ID from caller_profile.gender (or persona.voice_description), and voice_settings
 *     (stability, style, speed) from persona for more emotional/realistic delivery.
 * @returns {Promise<{ filePath: string, audioUrl: string }>}
 */
export async function textToSpeech(text, filename, voiceOptions) {
  if (!config.elevenlabs.apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const cleanedText = sanitizeForTts(text);
  const voiceId = resolveVoiceId(voiceOptions);
  const voiceSettings = resolveVoiceSettings(voiceOptions);
  const { modelId, outputFormat } = config.elevenlabs;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

  const body = {
    text: cleanedText || '.',
    model_id: modelId,
  };
  if (Object.keys(voiceSettings).length > 0) {
    body.voice_settings = voiceSettings;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.elevenlabs.apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `ElevenLabs TTS failed (${response.status}): ${errText}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const projectRoot = path.join(__dirname, '..', '..');
  const outDir = path.join(projectRoot, config.generatedAudioDir);

  await fs.mkdir(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);
  await fs.writeFile(filePath, buffer);

  const audioUrl = `${config.baseUrl.replace(/\/$/, '')}/${config.generatedAudioDir}/${filename}`;
  return { filePath, audioUrl };
}
