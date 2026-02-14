/**
 * Rule-based policy for live dispatch recommendations.
 * Each rule matches on transcript (or signals) and suggests units + severity + rationale.
 */

/** @typedef {'EMT_BLS'|'ALS'|'Police'|'Fire'|'SWAT'} UnitType */
/** @typedef {'low'|'medium'|'high'|'critical'} Severity */

/**
 * @typedef {Object} PolicyRule
 * @property {string} id - Unique rule id
 * @property {RegExp|((text: string) => boolean)} match - Match against transcript or signal
 * @property {UnitType[]} units - Units to recommend when rule matches
 * @property {Severity} severity
 * @property {string} rationale - Human-readable reason
 * @property {boolean} [critical] - If true, bypass debounce (immediate recommendation)
 */

/** @type {PolicyRule[]} */
export const DEFAULT_POLICY_RULES = [
  // Critical: immediate update
  {
    id: 'shots_fired',
    match: (text) => /shots?\s*fired|gunfire|shooting|someone\s*shot|heard\s*gun/i.test(text),
    units: ['Police', 'SWAT'],
    severity: 'critical',
    rationale: 'Weapons / shots reported — Police and SWAT recommended.',
    critical: true,
  },
  {
    id: 'not_breathing',
    match: (text) => /not\s*breathing|no\s*breath|unconscious|no\s*pulse|CPR|cardiac\s*arrest/i.test(text),
    units: ['EMT_BLS', 'ALS'],
    severity: 'critical',
    rationale: 'Life-threatening medical — BLS and ALS recommended.',
    critical: true,
  },
  {
    id: 'fire',
    match: (text) => /fire|burning|smoke|flames|house\s*on\s*fire/i.test(text),
    units: ['Fire', 'EMT_BLS'],
    severity: 'critical',
    rationale: 'Fire reported — Fire and EMS recommended.',
    critical: true,
  },
  // High
  {
    id: 'bleeding',
    match: (text) => /bleeding|hemorrhage|blood\s*loss|stabbed|cut\s*badly/i.test(text),
    units: ['EMT_BLS', 'ALS'],
    severity: 'high',
    rationale: 'Significant bleeding — BLS and ALS recommended.',
  },
  {
    id: 'stroke',
    match: (text) => /stroke|FAST|face\s*droop|can\'t\s*speak|slurred/i.test(text),
    units: ['ALS'],
    severity: 'high',
    rationale: 'Possible stroke — ALS recommended.',
  },
  {
    id: 'overdose',
    match: (text) => /overdose|OD|unresponsive|narcan|opioid/i.test(text),
    units: ['EMT_BLS', 'ALS', 'Police'],
    severity: 'high',
    rationale: 'Possible overdose — BLS, ALS, and Police recommended.',
  },
  {
    id: 'assault',
    match: (text) => /assault|attack|fighting|domestic\s*violence|beating/i.test(text),
    units: ['Police', 'EMT_BLS'],
    severity: 'high',
    rationale: 'Violence / assault — Police and EMS recommended.',
  },
  // Medium
  {
    id: 'fall',
    match: (text) => /fell|fall|broken\s*bone|fracture|can\'t\s*move/i.test(text),
    units: ['EMT_BLS'],
    severity: 'medium',
    rationale: 'Fall or possible fracture — BLS recommended.',
  },
  {
    id: 'chest_pain',
    match: (text) => /chest\s*pain|heart\s*attack|heart\s*pain|pressure\s*in\s*chest/i.test(text),
    units: ['EMT_BLS', 'ALS'],
    severity: 'high',
    rationale: 'Chest pain / possible cardiac — BLS and ALS recommended.',
  },
  {
    id: 'breathing_difficulty',
    match: (text) => /can\'t\s*breathe|difficulty\s*breathing|short\s*of\s*breath|asthma|choking/i.test(text),
    units: ['EMT_BLS', 'ALS'],
    severity: 'medium',
    rationale: 'Breathing difficulty — BLS and ALS recommended.',
  },
  {
    id: 'traffic_accident',
    match: (text) => /accident|car\s*crash|MVA|collision|wreck/i.test(text),
    units: ['Police', 'EMT_BLS', 'Fire'],
    severity: 'medium',
    rationale: 'Traffic accident — Police, EMS, and Fire recommended.',
  },
  {
    id: 'intruder',
    match: (text) => /intruder|break-in|burglar|someone\s*inside|breaking\s*in/i.test(text),
    units: ['Police'],
    severity: 'medium',
    rationale: 'Intruder / break-in — Police recommended.',
  },
  // Low / general
  {
    id: 'sick',
    match: (text) => /sick|vomit|fever|pain|not\s*feeling\s*well/i.test(text),
    units: ['EMT_BLS'],
    severity: 'low',
    rationale: 'Medical complaint — BLS recommended.',
  },
  {
    id: 'unknown_emergency',
    match: (text) => /help|emergency|911|someone\s*call/i.test(text),
    units: ['Police', 'EMT_BLS'],
    severity: 'medium',
    rationale: 'General emergency — Police and BLS standby until more info.',
  },
];

/**
 * Evaluate rules against transcript; returns matching rules with units and max severity.
 * @param {string} transcript
 * @param {PolicyRule[]} [rules]
 * @returns {{ units: UnitType[], severity: Severity, rationales: Array<{ unit: UnitType, rationale: string, severity: string }>, critical: boolean }}
 */
export function evaluateRules(transcript, rules = DEFAULT_POLICY_RULES) {
  const text = (transcript || '').trim();
  const rationales = [];
  const unitSet = new Set(/** @type {UnitType[]} */ ([]));
  let maxSeverity = /** @type {Severity} */ ('low');
  let critical = false;

  for (const rule of rules) {
    const matches = typeof rule.match === 'function' ? rule.match(text) : rule.match.test(text);
    if (!matches) continue;

    if (rule.critical) critical = true;
    for (const u of rule.units) {
      unitSet.add(u);
      rationales.push({ unit: u, rationale: rule.rationale, severity: rule.severity });
    }
    if (severityRank(rule.severity) > severityRank(maxSeverity)) {
      maxSeverity = rule.severity;
    }
  }

  return {
    units: [...unitSet],
    severity: maxSeverity,
    rationales,
    critical,
  };
}

function severityRank(s) {
  const r = { low: 0, medium: 1, high: 2, critical: 3 };
  return r[s] ?? 0;
}

/** Min transcript length (chars) before we suggest a specific unit count (keeps early suggestions broad). */
const MIN_TRANSCRIPT_LENGTH_FOR_COUNT = 80;

/**
 * Infer suggested number of units from transcript (e.g. "two people down" -> 2).
 * Returns null when transcript is short (broad suggestion) or no number detected.
 * @param {string} transcript
 * @returns {number | null}
 */
export function inferSuggestedCount(transcript) {
  const text = (transcript || '').trim();
  if (text.length < MIN_TRANSCRIPT_LENGTH_FOR_COUNT) return null;

  const lower = text.toLowerCase();
  // Explicit numbers / counts
  if (/\b(one|single|just one|only one|a single)\s+(person|victim|patient|man|woman|guy|injured|down|hurt)/i.test(lower) ||
      /\b(one|single)\s+(is|has been|got)\s+(hurt|injured|down)/i.test(lower)) return 1;
  if (/\b(two|both|couple)\s+(people|persons|victims|patients|men|women|guys|injured|down|hurt)/i.test(lower) ||
      /\b(two|both)\s+(are|have been|got)\s+(hurt|injured|down)/i.test(lower) ||
      /\b2\s+(people|persons|victims|patients)/i.test(lower)) return 2;
  if (/\b(three|three people|3\s+people)\s+(injured|down|hurt|people)/i.test(lower) ||
      /\b(three|3)\s+(are|have been|got)\s+(hurt|injured|down)/i.test(lower)) return 3;
  if (/\b(multiple|several|many|few|four|4|five|5)\s+(people|persons|victims|patients|injured|down)/i.test(lower) ||
      /\b(multiple|several|many)\s+(victims|people|injured)/i.test(lower)) return 3;

  return null;
}

/**
 * Deduplicate rationales by unit: one entry per unit, keeping the highest-severity rationale.
 * @param {Array<{ unit: UnitType, rationale: string, severity: string }>} rationales
 * @returns {Array<{ unit: UnitType, rationale: string, severity: string }>}
 */
export function deduplicateByUnit(rationales) {
  const byUnit = new Map();
  for (const r of rationales) {
    const existing = byUnit.get(r.unit);
    if (!existing || severityRank(r.severity) > severityRank(existing.severity)) {
      byUnit.set(r.unit, { unit: r.unit, rationale: r.rationale, severity: r.severity });
    }
  }
  return [...byUnit.values()];
}
