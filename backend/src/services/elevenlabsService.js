import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Converts transcript text to speech using ElevenLabs TTS and saves to a file.
 * Returns the path to the saved file (relative to project root) and the public URL.
 *
 * @param {string} text - The dialog text to convert to speech.
 * @param {string} filename - Output filename (e.g. "abc123.mp3").
 * @returns {Promise<{ filePath: string, audioUrl: string }>}
 */
export async function textToSpeech(text, filename) {
  if (!config.elevenlabs.apiKey) {
    throw new Error(
      'ELEVENLABS_API_KEY is not set. Add it to .env or set the environment variable.'
    );
  }

  const { voiceId, modelId, outputFormat } = config.elevenlabs;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${outputFormat}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': config.elevenlabs.apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
    }),
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
