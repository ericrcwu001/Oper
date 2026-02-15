import OpenAI, { toFile } from 'openai';
import { config } from '../config.js';

/**
 * Converts speech audio to text using OpenAI Whisper.
 * Use when the client sends audio (e.g. base64) instead of text for userInput.
 *
 * @param {Buffer} audioBuffer - Raw audio bytes (e.g. from decoded base64).
 * @param {string} [filename='audio.mp3'] - Filename hint for format (e.g. 'audio.webm', 'audio.mp3').
 * @returns {Promise<string>} - Transcribed text.
 */
export async function speechToText(audioBuffer, filename = 'audio.mp3') {
  if (!config.openai.apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const openai = new OpenAI({ apiKey: config.openai.apiKey });

  const file = await toFile(audioBuffer, filename);

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'en',
  });

  const text = transcription?.text?.trim();
  if (text === undefined) {
    throw new Error('Whisper returned no transcript.');
  }

  return text;
}
