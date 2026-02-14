import { Router } from 'express';
import { generateScenario } from '../services/scenarioGenerator.js';

const router = Router();

/**
 * POST /api/scenarios/generate
 *
 * Body: { "difficulty": "easy" | "medium" | "hard" }
 * Returns: Full scenario payload (scenario, persona, caller_script, role_instruction,
 * scenario_summary_for_agent, critical_info, behavior_notes, etc.) for frontend and
 * ElevenLabs Flash v2.5 voice agent.
 */
router.post('/generate', async (req, res) => {
  const difficulty = req.body?.difficulty;
  if (difficulty == null || typeof difficulty !== 'string') {
    return res.status(400).json({
      error: "Missing or invalid 'difficulty'. Use { \"difficulty\": \"easy\" | \"medium\" | \"hard\" }.",
    });
  }

  const normalized = difficulty.trim().toLowerCase();
  if (!['easy', 'medium', 'hard'].includes(normalized)) {
    return res.status(400).json({ error: 'difficulty must be one of: easy, medium, hard' });
  }

  try {
    const payload = await generateScenario(normalized);
    return res.json(payload);
  } catch (err) {
    if (err.message?.includes('OPENAI_API_KEY') || err.message?.includes('difficulty')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Scenario generation failed:', err.message);
    return res.status(500).json({
      error: `Scenario generation failed: ${err.message}`,
    });
  }
});

export default router;
