import { Router } from 'express';
import { evaluateRules, deduplicateByUnit, inferSuggestedCount } from '../call-evaluation/policy-rules.js';

const router = Router();

/**
 * POST /api/call-evaluation/assess
 * Body: { transcript: string }
 * Returns: { units: [{ unit, rationale, severity }], severity, critical?, suggestedCount? }
 * One entry per recommended unit (deduplicated). suggestedCount when transcript is long enough and count is inferred.
 */
router.post('/assess', (req, res) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';
    const result = evaluateRules(transcript);
    const units = deduplicateByUnit(result.rationales);
    const suggestedCount = inferSuggestedCount(transcript);
    res.json({
      units,
      severity: result.severity,
      critical: result.critical,
      ...(suggestedCount != null && { suggestedCount }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Assessment failed' });
  }
});

export default router;
