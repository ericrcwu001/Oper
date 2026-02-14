/**
 * WebSocket server for live call evaluation: receives audio, runs STT and assessment, emits transcript + recommendation events.
 */

import { WebSocketServer } from 'ws';
import { MSG } from './message-contracts.js';
import { createSttStream } from './stt-stream.js';
import { createAssessmentEngine } from './assessment-engine.js';

/**
 * @param {import('http').Server} httpServer - Same HTTP server as Express (for WS upgrade)
 */
export function attachLiveEvalWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    if (url.pathname !== '/live-eval') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws) => {
    let sttStream = null;
    let assessment = null;

    function send(type, payload) {
      if (ws.readyState !== ws.OPEN) return;
      try {
        ws.send(JSON.stringify({ type, payload }));
      } catch (e) {
        console.warn('[live-eval] send error:', e.message);
      }
    }

    assessment = createAssessmentEngine((rec) => {
      send(MSG.RECOMMENDATION_UPDATE, rec);
    });

    sttStream = createSttStream((event, text, isPartial) => {
      if (event === 'delta') {
        send(MSG.TRANSCRIPT_DELTA, { text, isPartial: !!isPartial });
      } else {
        send(MSG.TRANSCRIPT_FINAL, { text });
        assessment.processFinalTranscript(text);
      }
    });

    ws.on('message', (data) => {
      try {
        if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
          sttStream.pushAudio(data);
          return;
        }
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        if (msg.type === MSG.AUDIO_CHUNK && msg.payload?.base64) {
          sttStream.pushAudio(Buffer.from(msg.payload.base64, 'base64'));
        } else if (msg.type === MSG.END_SESSION) {
          sttStream.flush().then(() => {});
        }
      } catch (e) {
        send(MSG.ERROR, { message: e.message || 'Invalid message' });
      }
    });

    ws.on('close', () => {
      if (sttStream) sttStream.close();
      if (assessment) assessment.reset();
    });
  });

  return wss;
}
