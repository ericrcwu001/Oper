#!/usr/bin/env node
/**
 * Verify that transcript labels map to correct priority and dispatch (e.g. MASS SHOOTER -> 6 units, critical).
 * Run from repo root: node backend/scripts/verify-dispatch-priority.js
 */

import { getPriorityFromTranscriptLabel, priorityToDispatch } from '../src/services/dispatchPriorityService.js';

async function main() {
  const label = 'MASS SHOOTER';
  const priority = await getPriorityFromTranscriptLabel(label);
  const dispatch = priorityToDispatch(priority);
  console.log(`Label "${label}" -> priority ${priority} ->`, dispatch);
  const ok = priority === 5 && dispatch.suggestedCount === 6 && dispatch.severity === 'critical' && dispatch.critical === true;
  if (ok) {
    console.log('PASS: mass shooter maps to 6 units, critical');
  } else {
    console.error('FAIL: expected priority 5, suggestedCount 6, severity critical');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
