import { Router } from 'express';
import { evaluateRules, deduplicateByUnit } from '../call-evaluation/policy-rules.js';

const router = Router();

/**
 * POST /api/call-evaluation/assess
 * Body: { transcript: string }
 * Returns: { units: [{ unit, rationale, severity }], severity, critical? }
 * One entry per recommended unit (deduplicated), with highest-severity rationale.
 */
router.post('/assess', (req, res) => {
  try {
    const transcript = typeof req.body?.transcript === 'string' ? req.body.transcript : '';
    const result = evaluateRules(transcript);
    const units = deduplicateByUnit(result.rationales);
    res.json({
      units,
      severity: result.severity,
      critical: result.critical,
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Assessment failed' });
  }
});

export default router;
