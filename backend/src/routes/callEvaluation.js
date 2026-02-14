import { Router } from 'express';
import { assessTranscriptWithLLM } from '../services/liveEvalService.js';

const router = Router();

/**
 * POST /api/call-evaluation/assess
 * Body: { transcript: string }
 * Returns: { units, severity, critical?, suggestedCount?, stage?, latestTrigger? }
 * Live evaluation uses an LLM with RAG (ragDocs) to analyze the caller transcript.
 */
router.post('/assess', async (req, res) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';
    const result = await assessTranscriptWithLLM(transcript);
    res.json(result);
  } catch (e) {
    const message = e.message || 'Assessment failed';
    if (message.includes('OPENAI_API_KEY')) {
      res.status(503).json({
        error: 'Live evaluation is unavailable: OPENAI_API_KEY is not set.',
      });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;
