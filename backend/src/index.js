import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import callAudioRouter from './routes/callAudio.js';
import scenariosRouter from './routes/scenarios.js';

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

app.listen(config.port, () => {
  console.log(`911 call simulation backend running at http://localhost:${config.port}`);
  console.log('POST /api/scenarios/generate with body: { "difficulty": "easy"|"medium"|"hard" }');
  console.log('POST /generate-call-audio with body: { "scenario": "..." }');
  console.log('POST /interact with body: { "scenario", "userInput" or "userInputAudio", optional "conversationHistory" }');
});
