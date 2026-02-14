/**
 * One-off: generate 3 easy, 3 medium, 3 hard scenarios and write to a single txt file.
 * Run from backend: node scripts/generate-nine-scenarios.js
 * Requires OPENAI_API_KEY in env or .env.
 */
import 'dotenv/config';
import { generateScenario } from '../src/services/scenarioGenerator.js';
import { writeFileSync } from 'fs';

const OUT_FILE = 'generated-scenarios.txt';

async function main() {
  const lines = [];
  lines.push('Generated 911 training scenarios (3 easy, 3 medium, 3 hard)');
  lines.push('Generated at: ' + new Date().toISOString());
  lines.push('');

  for (const difficulty of ['easy', 'medium', 'hard']) {
    for (let i = 1; i <= 3; i++) {
      lines.push('='.repeat(60));
      lines.push(`=== ${difficulty.toUpperCase()} SCENARIO ${i} ===`);
      lines.push('='.repeat(60));
      try {
        const payload = await generateScenario(difficulty);
        lines.push(JSON.stringify(payload, null, 2));
      } catch (err) {
        lines.push('ERROR: ' + err.message);
      }
      lines.push('');
    }
  }

  writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
  console.log('Wrote ' + OUT_FILE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
