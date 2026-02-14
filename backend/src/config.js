import dotenv from 'dotenv';

dotenv.config();

/**
 * Configuration for the 911 call simulation backend.
 *
 * API KEYS (insert in .env or set as environment variables):
 * - OPENAI_API_KEY: From https://platform.openai.com/api-keys
 * - ELEVENLABS_API_KEY: From https://elevenlabs.io/app/settings/api-keys
 */
export const config = {
  port: parseInt(process.env.PORT || '3001', 10),

  /** OpenAI API key – used for generating emergency call dialog (GPT-4). */
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  /** ElevenLabs API key and voice – used for text-to-speech (caller audio). */
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    // Default voice ID (used when caller is male or unknown).
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    // Optional: voice for female callers. Set ELEVENLABS_VOICE_ID_FEMALE to enable.
    voiceIdFemale: process.env.ELEVENLABS_VOICE_ID_FEMALE || 'EXAVITQu4vr4xnSDxMaL',
    modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
  },

  /** Base URL for generated audio URLs (e.g. http://localhost:3001). Set in production. */
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',

  /** Directory (relative to project root) where generated audio files are saved. */
  generatedAudioDir: process.env.GENERATED_AUDIO_DIR || 'generated-audio',
};
