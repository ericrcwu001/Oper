import path from 'path';
import fs from 'fs/promises';
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { generateCallDialog, getNextCallerResponse } from '../services/openaiService.js';
import { textToSpeech, sanitizeCallerResponseText } from '../services/elevenlabsService.js';
import { speechToText } from '../services/whisperService.js';
import { evaluateCall } from '../services/evaluationService.js';
import { processCaller911, convertMp3ToWav } from '../utils/911audio.js';
import { config } from '../config.js';

const router = Router();

async function unlinkSafe(filePath) {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

/** Filler sample scenario used when none is provided (e.g. for quick testing). */
const SAMPLE_SCENARIO =
  'A man at a grocery store has collapsed. He is breathing but unconscious. A bystander is calling 911 and needs to explain the situation to the operator.';

/**
 * Detect if the object is in scenarioGenerator.js format (has scenario + persona).
 * @param {object} raw
 */
function isScenarioGeneratorPayload(raw) {
  return (
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    raw.scenario &&
    typeof raw.scenario === 'object' &&
    raw.persona &&
    typeof raw.persona === 'object'
  );
}

/**
 * Build a single scenario string for OpenAI from a scenario generator payload.
 */
function fullScenarioFromGeneratorPayload(payload) {
  const summary = payload.scenario_summary_for_agent || payload.scenario?.description || '';
  const profile = payload.scenario?.caller_profile || {};
  const parts = [summary];
  const name = profile.name || '';
  const age = profile.age != null ? profile.age : '';
  const emotion = profile.emotion || '';
  const gender = profile.gender || '';
  if (name || age || emotion || gender) {
    parts.push(
      `Caller: ${[name, age, emotion, gender].filter(Boolean).join(', ')}.`
    );
  }
  return parts.filter(Boolean).join(' ');
}

/**
 * Run 911 phone-chain on TTS MP3. On success returns { audioUrl } for the .wav.
 * If ffmpeg is missing (ENOENT) or processing fails, returns { audioUrl } for the original .mp3.
 */
async function apply911PipelineOrFallback(id, mp3Path) {
  const dir = path.dirname(mp3Path);
  const preWavPath = path.join(dir, `${id}_pre.wav`);
  const outWavPath = path.join(dir, `${id}.wav`);
  try {
    await convertMp3ToWav(mp3Path, preWavPath);
    await processCaller911({ inWavPath: preWavPath, outWavPath, addNoise: true });
    // Keep only the final .wav; remove intermediate pre-wav and source mp3
    await unlinkSafe(preWavPath);
    await unlinkSafe(mp3Path);
    return {
      audioUrl: `${config.baseUrl.replace(/\/$/, '')}/${config.generatedAudioDir}/${id}.wav`,
    };
  } catch (err) {
    if (err.code === 'ENOENT' || err.message?.includes('spawn ffmpeg')) {
      console.warn('ffmpeg not found or failed; serving original TTS audio. Install ffmpeg for 911 phone effect.');
    } else {
      console.warn('911 audio processing failed:', err.message);
    }
    return {
      audioUrl: `${config.baseUrl.replace(/\/$/, '')}/${config.generatedAudioDir}/${id}.mp3`,
    };
  }
}

/**
 * Normalize request body into scenario string (for OpenAI) and voice options for TTS.
 * Reads from body.scenarioPayload (generator payload) or body.scenario (string or object).
 */
function parseScenarioBody(body) {
  const raw = body?.scenarioPayload ?? body?.scenario;
  if (body === undefined || body === null) {
    return { fullScenario: SAMPLE_SCENARIO, voiceOptions: undefined };
  }
  if (raw === undefined || raw === null) {
    return { fullScenario: SAMPLE_SCENARIO, voiceOptions: undefined };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim() || SAMPLE_SCENARIO;
    return { fullScenario: trimmed, voiceOptions: undefined };
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return null;
  }
  if (isScenarioGeneratorPayload(raw)) {
    const fullScenario = fullScenarioFromGeneratorPayload(raw);
    return { fullScenario: fullScenario || SAMPLE_SCENARIO, voiceOptions: raw };
  }
  const scenarioDescription =
    typeof raw.scenarioDescription === 'string' ? raw.scenarioDescription.trim() : '';
  const callerDescription =
    typeof raw.callerDescription === 'string' ? raw.callerDescription.trim() : undefined;
  const difficulty =
    typeof raw.difficulty === 'string' && ['easy', 'medium', 'hard'].includes(raw.difficulty.toLowerCase())
      ? raw.difficulty.toLowerCase()
      : undefined;
  const fullScenario = scenarioDescription
    ? (callerDescription ? `${scenarioDescription} Caller: ${callerDescription}.` : scenarioDescription)
    : SAMPLE_SCENARIO;
  const voiceOptions =
    scenarioDescription || callerDescription || difficulty
      ? { scenarioDescription, callerDescription, difficulty }
      : undefined;
  return { fullScenario, voiceOptions };
}

/**
 * POST /generate-call-audio
 *
 * Body: { "scenario": string | object } OR { "scenarioPayload": object }
 * - scenario (string): Legacy; full description of the emergency and caller.
 * - scenario (object): { scenarioDescription, callerDescription } or full scenarioGenerator payload for TTS voice + persona.
 * - scenarioPayload: Full payload from POST /api/scenarios/generate (alternative to scenario).
 *
 * Returns: { "audioUrl": "https://...", "transcript": "Generated dialog text" }
 */
router.post('/generate-call-audio', async (req, res) => {
  try {
    const parsed = parseScenarioBody(req.body);
    if (!parsed) {
      return res.status(400).json({
        error:
          'Invalid "scenario": must be a string or object { scenarioDescription, callerDescription }.',
      });
    }

    const { fullScenario, voiceOptions } = parsed;
    if (!fullScenario) {
      return res.status(400).json({
        error: 'Scenario cannot be empty.',
      });
    }

    // 1. Generate dialog from scenario (OpenAI); pass persona payload when available for persona-based dialogue
    const transcript = await generateCallDialog(fullScenario, voiceOptions);

    // 2. Convert dialog to audio (ElevenLabs); voiceOptions = string (legacy) or scenario generator payload (voice + persona settings)
    const id = randomUUID();
    const filenameMp3 = `${id}.mp3`;
    const { filePath: mp3Path } = await textToSpeech(transcript, filenameMp3, voiceOptions);

    // 3. Optionally run 911 phone-chain (requires ffmpeg); fallback to original MP3
    const { audioUrl } = await apply911PipelineOrFallback(id, mp3Path);

    return res.status(200).json({
      audioUrl,
      transcript,
    });
  } catch (err) {
    console.error('generate-call-audio error:', err.message);

    if (err.message.includes('OPENAI_API_KEY') || err.message.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({
        error: 'Service configuration error. Check server API keys.',
        details: err.message,
      });
    }

    if (err.message.includes('OpenAI') || err.message.includes('ElevenLabs')) {
      return res.status(502).json({
        error: 'External service error while generating call audio.',
        details: err.message,
      });
    }

    return res.status(500).json({
      error: 'Failed to generate call audio.',
      details: err.message,
    });
  }
});

/**
 * Normalize and validate conversation history for /interact.
 * @param {unknown} raw
 * @returns {{ role: 'caller' | 'operator', content: string }[]}
 */
function parseConversationHistory(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (turn) =>
        turn &&
        typeof turn === 'object' &&
        (turn.role === 'caller' || turn.role === 'operator') &&
        typeof turn.content === 'string'
    )
    .map((turn) => ({ role: turn.role, content: String(turn.content).trim() }))
    .filter((turn) => turn.content.length > 0);
}

/**
 * POST /interact
 *
 * Live interaction: operator sends text or speech, backend returns next bot (caller) response as audio + transcript.
 * Supports multiple back-and-forth turns by sending conversationHistory each time.
 *
 * Body:
 * - scenario (required): string or { scenarioDescription, callerDescription }. Caller description used for TTS voice.
 * - userInput (optional): Operator message as text.
 * - userInputAudio (optional): Operator message as base64 audio; if present, transcribed with Whisper and used as operator message.
 * - conversationHistory (optional): Array of { role: "caller"|"operator", content: string } for prior turns.
 *
 * Returns: { audioUrl, transcript, conversationHistory }
 */
router.post('/interact', async (req, res) => {
  try {
    const { userInput, userInputAudio, conversationHistory: rawHistory } = req.body;

    const parsed = parseScenarioBody(req.body);
    if (!parsed || !parsed.fullScenario) {
      return res.status(400).json({
        error: 'Missing or empty "scenario". Required for context. Send "scenario" or "scenarioPayload".',
      });
    }

    const { fullScenario: scenario, voiceOptions } = parsed;

    // Operator message: either from text or from speech (Whisper)
    let operatorMessage = typeof userInput === 'string' ? userInput.trim() : '';
    if (userInputAudio && typeof userInputAudio === 'string') {
      const base64 = userInputAudio.replace(/^data:audio\/[^;]+;base64,/, '');
      let buffer;
      try {
        buffer = Buffer.from(base64, 'base64');
      } catch {
        return res.status(400).json({
          error: 'Invalid "userInputAudio": must be valid base64.',
        });
      }
      if (buffer.length === 0) {
        return res.status(400).json({
          error: 'Invalid "userInputAudio": decoded audio is empty.',
        });
      }
      const transcribed = await speechToText(buffer, 'operator-audio.webm');
      operatorMessage = transcribed || operatorMessage;
    }
    if (!operatorMessage) {
      return res.status(400).json({
        error: 'Provide either "userInput" (text) or "userInputAudio" (base64 speech) as the operator message.',
      });
    }

    const conversationHistory = parseConversationHistory(rawHistory);

    // Generate next caller response (GPT-4) with full context and optional persona
    const rawCallerText = await getNextCallerResponse(
      scenario,
      conversationHistory,
      operatorMessage,
      voiceOptions
    );
    const nextCallerText = sanitizeCallerResponseText(rawCallerText) || rawCallerText;

    // Convert to audio (ElevenLabs), then optionally 911 phone-chain (requires ffmpeg)
    const id = randomUUID();
    const filenameMp3 = `${id}.mp3`;
    const { filePath: mp3Path } = await textToSpeech(nextCallerText, filenameMp3, voiceOptions);
    const { audioUrl } = await apply911PipelineOrFallback(id, mp3Path);

    // Build updated history for next request (client should send this back)
    const updatedHistory = [
      ...conversationHistory,
      { role: 'operator', content: operatorMessage },
      { role: 'caller', content: nextCallerText },
    ];

    return res.status(200).json({
      audioUrl,
      transcript: nextCallerText,
      conversationHistory: updatedHistory,
    });
  } catch (err) {
    console.error('interact error:', err.message);

    if (err.message.includes('OPENAI_API_KEY') || err.message.includes('ELEVENLABS_API_KEY')) {
      return res.status(503).json({
        error: 'Service configuration error. Check server API keys.',
        details: err.message,
      });
    }
    if (err.message.includes('OpenAI') || err.message.includes('Whisper') || err.message.includes('ElevenLabs')) {
      return res.status(502).json({
        error: 'External service error during interaction.',
        details: err.message,
      });
    }
    return res.status(500).json({
      error: 'Interaction failed.',
      details: err.message,
    });
  }
});

/**
 * POST /evaluate
 *
 * Body: { transcript: TranscriptTurn[], notes: NoteEntry[], scenarioDescription: string }
 * Returns: { protocolAdherence, timeliness, criticalInfoCapture, overallScore, missedActions, feedbackBullets }
 */
router.post('/evaluate', async (req, res) => {
  try {
    const { transcript, notes, scenarioDescription } = req.body;
    if (!Array.isArray(transcript)) {
      return res.status(400).json({ error: 'Missing or invalid "transcript" array.' });
    }
    if (!Array.isArray(notes)) {
      return res.status(400).json({ error: 'Missing or invalid "notes" array.' });
    }
    const scenario = typeof scenarioDescription === 'string' ? scenarioDescription.trim() : '';
    const evaluation = await evaluateCall(transcript, notes, scenario || '911 emergency call.');
    return res.status(200).json(evaluation);
  } catch (err) {
    console.error('evaluate error:', err.message);
    if (err.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({ error: 'Service configuration error.', details: err.message });
    }
    return res.status(500).json({ error: 'Evaluation failed.', details: err.message });
  }
});

export default router;
