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

  /** OpenAI API key – used for generating emergency call dialog (GPT-4) and optional TTS. */
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    /** TTS model: gpt-4o-mini-tts-2025-03-20 (pinned for natural pacing), or override with OPENAI_TTS_MODEL. */
    ttsModel: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts-2025-03-20',
  },

  /** TTS provider: "openai" (default) or "elevenlabs". */
  ttsProvider: (process.env.TTS_PROVIDER || 'openai').toLowerCase(),

  /** ElevenLabs API key and voice – used for text-to-speech when TTS_PROVIDER=elevenlabs. */
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    // Default voice ID (used when caller is male or unknown).
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    // Optional: voice for female callers. Set ELEVENLABS_VOICE_ID_FEMALE to enable.
    voiceIdFemale: process.env.ELEVENLABS_VOICE_ID_FEMALE || 'pFZP5JQG7iQjIQuC4Bku',
    modelId: process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2',
    outputFormat: 'mp3_44100_128',
  },

  /** Base URL for generated audio URLs (e.g. http://localhost:3001). Set in production. */
  baseUrl: process.env.BASE_URL || 'http://localhost:3001',

  /** Directory (relative to project root) where generated audio files are saved. */
  generatedAudioDir: process.env.GENERATED_AUDIO_DIR || 'generated-audio',

  /** RAG: directory containing 911 operator reference docs (.md, .txt). Relative to backend root. */
  rag: {
    docsDir: process.env.RAG_DOCS_DIR || 'ragDocs',
  },

  /** Optional: full path to ffmpeg executable (e.g. for Windows when not on PATH). */
  ffmpegPath: process.env.FFMPEG_PATH || null,
};
