/**
 * Streaming STT adapter: receives audio chunks, produces transcript events.
 * Uses chunked Whisper when OPENAI_API_KEY is set; otherwise mock for E2E testing.
 */

import { speechToText } from '../services/whisperService.js';
import { config } from '../config.js';

const CHUNK_INTERVAL_MS = 2500;

/**
 * Create an STT stream handler for one session.
 * @param {(event: 'delta'|'final', text: string, isPartial?: boolean) => void} onTranscript
 * @returns {{ pushAudio: (chunk: Buffer) => void, flush: () => Promise<void>, close: () => void }}
 */
export function createSttStream(onTranscript) {
  const buffers = [];
  let intervalId = null;
  let closed = false;

  async function processBuffer() {
    if (buffers.length === 0 || closed) return;
    const concat = Buffer.concat(buffers);
    buffers.length = 0;
    if (concat.length < 1000) return;

    const hasKey = !!config.openai?.apiKey;

    if (hasKey) {
      try {
        const text = await speechToText(concat, 'audio.webm');
        if (text && text.trim()) onTranscript('final', text.trim(), false);
      } catch (err) {
        console.warn('[live-eval STT] Whisper error:', err.message);
      }
      return;
    }

    const mockText = '[Mock transcript. Say "fire" or "not breathing" to test rules. Set OPENAI_API_KEY for real STT.]';
    onTranscript('final', mockText, false);
  }

  function startChunkedTimer() {
    if (intervalId) return;
    intervalId = setInterval(() => processBuffer(), CHUNK_INTERVAL_MS);
  }

  return {
    pushAudio(chunk) {
      if (closed) return;
      if (Buffer.isBuffer(chunk)) buffers.push(chunk);
      else if (chunk instanceof ArrayBuffer) buffers.push(Buffer.from(chunk));
      else buffers.push(Buffer.from(chunk));
      startChunkedTimer();
    },
    async flush() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      await processBuffer();
    },
    close() {
      closed = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      buffers.length = 0;
    },
  };
}
