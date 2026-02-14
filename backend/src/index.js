import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import callAudioRouter from './routes/callAudio.js';
import scenariosRouter from './routes/scenarios.js';
import vehiclesRouter from './routes/vehicles.js';
import { startSimulation } from './services/vehicleSimulation.js';
import callEvaluationRouter from './routes/callEvaluation.js';
import crimesRouter from './routes/crimes.js';
import { attachLiveEvalWebSocket } from './call-evaluation/websocket-handler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
// Larger limit for /interact when sending base64 audio (userInputAudio)
app.use(express.json({ limit: '10mb' }));

// Serve generated audio files so audioUrl can be used by the frontend
const generatedPath = path.join(__dirname, '..', config.generatedAudioDir);
app.use(`/${config.generatedAudioDir}`, express.static(generatedPath));

// Health check
app.get('/health', (_, res) => {
  res.json({ status: 'ok', service: '911-call-simulation' });
});

// Generate call audio from scenario
app.use('/', callAudioRouter);

// Scenario generation (difficulty → full payload for frontend + voice agent)
app.use('/api/scenarios', scenariosRouter);

// Simulated vehicle positions (poll for map dots)
app.use('/api/vehicles', vehiclesRouter);

// Live call evaluation: assess transcript for dispatch recommendations (used during simulation)
app.use('/api/call-evaluation', callEvaluationRouter);

// SF crimes from CSV: time-windowed for map simulation (3x speed)
app.use('/api/crimes', crimesRouter);

const server = http.createServer(app);
attachLiveEvalWebSocket(server);

server.listen(config.port, () => {
  startSimulation();
  console.log(`911 call simulation backend running at http://localhost:${config.port}`);
  console.log('WebSocket: ws://localhost:' + config.port + '/live-eval (live call evaluation)');
  console.log('POST /api/scenarios/generate with body: { "difficulty": "easy"|"medium"|"hard" }');
  console.log('POST /generate-call-audio with body: { "scenario": "..." }');
  console.log('POST /interact with body: { "scenario", "userInput" or "userInputAudio", optional "conversationHistory" }');
});
