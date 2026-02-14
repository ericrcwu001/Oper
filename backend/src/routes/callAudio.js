import { Router } from 'express';
import { randomUUID } from 'crypto';
import { generateCallDialog, getNextCallerResponse } from '../services/openaiService.js';
import { textToSpeech } from '../services/elevenlabsService.js';
import { speechToText } from '../services/whisperService.js';

const router = Router();

/** Filler sample scenario used when none is provided (e.g. for quick testing). Easy to swap for other scenarios later. */
const SAMPLE_SCENARIO =
  'A man at a grocery store has collapsed. He is breathing but unconscious. A bystander is calling 911 and needs to explain the situation to the operator.';

/**
 * POST /generate-call-audio
 *
 * Body: { "scenario": "string" }
 * - scenario: Description of the emergency (e.g. "Jack has fallen and broken his arm, explain the situation to the operator.")
 *   Omit or leave empty to use the built-in sample scenario.
 *
 * Returns: { "audioUrl": "https://...", "transcript": "Generated dialog text" }
 */
router.post('/generate-call-audio', async (req, res) => {
  try {
    let { scenario } = req.body;

    if (scenario === undefined || scenario === null) {
      scenario = SAMPLE_SCENARIO;
    }
    if (typeof scenario !== 'string') {
      return res.status(400).json({
        error: 'Invalid "scenario": must be a string. Expected JSON: { "scenario": "string" }',
      });
    }

    const trimmedScenario = scenario.trim() || SAMPLE_SCENARIO;
    if (!trimmedScenario) {
      return res.status(400).json({
        error: 'Scenario cannot be empty.',
      });
    }

    // 1. Generate dialog from scenario (OpenAI)
    const transcript = await generateCallDialog(trimmedScenario);

    // 2. Convert dialog to audio (ElevenLabs) and save file
    const id = randomUUID();
    const filename = `${id}.mp3`;
    const { audioUrl } = await textToSpeech(transcript, filename);

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
 * - scenario (required): Original emergency scenario (placeholder for dynamic scenario input later).
 * - userInput (optional): Operator message as text.
 * - userInputAudio (optional): Operator message as base64 audio; if present, transcribed with Whisper and used as operator message.
 * - conversationHistory (optional): Array of { role: "caller"|"operator", content: string } for prior turns.
 *
 * Returns: { audioUrl, transcript, conversationHistory }
 */
router.post('/interact', async (req, res) => {
  try {
    const { scenario: rawScenario, userInput, userInputAudio, conversationHistory: rawHistory } = req.body;

    // Scenario: required; support placeholder / dynamic scenario input later
    let scenario =
      typeof rawScenario === 'string' ? rawScenario.trim() : '';
    if (!scenario) {
      return res.status(400).json({
        error: 'Missing or empty "scenario". Required for context. Use dynamic scenario when integrated.',
      });
    }

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

    // Generate next caller response (GPT-4) with full context
    const nextCallerText = await getNextCallerResponse(
      scenario,
      conversationHistory,
      operatorMessage
    );

    // Convert to audio (ElevenLabs)
    const id = randomUUID();
    const filename = `${id}.mp3`;
    const { audioUrl } = await textToSpeech(nextCallerText, filename);

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

export default router;
