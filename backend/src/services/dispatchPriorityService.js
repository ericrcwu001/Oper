/**
 * Dispatch priority: maps crime types and transcript labels to priority 1–5,
 * used to compute suggestedCount and severity for live dispatch recommendations.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { classifyTranscript } from './openaiService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRIORITY_MAP_PATH = path.join(__dirname, '..', '..', 'data', 'crime-priority-map.json');

/** @type {Promise<{ categoryDefaults: Record<string, number>, descriptOverrides: Record<string, number>, transcriptLabelToPriority: Record<string, number> }>} */
let priorityMapPromise = null;

/** Load and cache the priority map JSON. */
async function loadPriorityMap() {
  if (priorityMapPromise) return priorityMapPromise;
  priorityMapPromise = fs
    .readFile(PRIORITY_MAP_PATH, 'utf-8')
    .then((raw) => {
      const data = JSON.parse(raw);
      return {
        categoryDefaults: data.categoryDefaults || {},
        descriptOverrides: data.descriptOverrides || {},
        transcriptLabelToPriority: data.transcriptLabelToPriority || {},
      };
    });
  return priorityMapPromise;
}

/** Normalize a string for lookup: trim, uppercase, collapse spaces. */
function normalizeKey(s) {
  return (typeof s === 'string' ? s : '').trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Get priority (1–5) for a crime record from Category and Descript.
 * @param {string} [category] - CSV Category
 * @param {string} [description] - CSV Descript
 * @returns {Promise<number>} - 1–5
 */
export async function getPriorityFromCrime(category, description) {
  const map = await loadPriorityMap();
  const desc = normalizeKey(description);
  const cat = normalizeKey(category);
  if (desc && map.descriptOverrides[desc] != null) {
    return Math.min(5, Math.max(1, map.descriptOverrides[desc]));
  }
  if (cat && map.categoryDefaults[cat] != null) {
    return Math.min(5, Math.max(1, map.categoryDefaults[cat]));
  }
  return 2;
}

/** Synonym groups: any of these map to the first key in transcriptLabelToPriority. */
const LABEL_SYNONYMS = [
  ['MASS SHOOTER', 'MASS SHOOTING', 'ACTIVE SHOOTER', 'ACTIVE SHOOTING', 'MULTIPLE SHOOTING'],
  ['HOSTAGE', 'HOSTAGE SITUATION'],
  ['SHOOTING', 'PERSON SHOT', 'PEOPLE SHOT'],
];

/**
 * Get priority (1–5) for a transcript-derived incident label (e.g. "MASS SHOOTER", "FIRE").
 * @param {string} [label] - Label from classifyTranscript
 * @returns {Promise<number>} - 1–5
 */
export async function getPriorityFromTranscriptLabel(label) {
  const map = await loadPriorityMap();
  const key = normalizeKey(label);
  if (!key) return 2;

  // Direct lookup
  if (map.transcriptLabelToPriority[key] != null) {
    return Math.min(5, Math.max(1, map.transcriptLabelToPriority[key]));
  }

  // Synonym: resolve to canonical form and lookup
  for (const group of LABEL_SYNONYMS) {
    if (group.some((g) => key === g || key.includes(g) || g.includes(key))) {
      const canonical = group[0];
      const p = map.transcriptLabelToPriority[canonical];
      if (p != null) return Math.min(5, Math.max(1, p));
      break;
    }
  }

  // Partial match: e.g. "MASS SHOOTER AT MALL" -> check if any transcript label is a substring
  for (const [transcriptLabel, priority] of Object.entries(map.transcriptLabelToPriority)) {
    if (key.includes(transcriptLabel) || transcriptLabel.includes(key)) {
      return Math.min(5, Math.max(1, priority));
    }
  }

  return 2;
}

/**
 * Get situation priority from full caller transcript (Option A: classifyTranscript + label map).
 * @param {string} transcript - Full caller-side transcript
 * @returns {Promise<number>} - 1–5
 */
export async function getSituationPriority(transcript) {
  const label = await classifyTranscript(transcript);
  return getPriorityFromTranscriptLabel(label);
}

/**
 * Get situation priority and classified label (avoids duplicate classifyTranscript calls).
 * @param {string} transcript - Full caller-side transcript
 * @returns {Promise<{ priority: number, label: string }>} - 1–5 priority and incident label
 */
export async function getSituationPriorityWithLabel(transcript) {
  const label = await classifyTranscript(transcript);
  const priority = await getPriorityFromTranscriptLabel(label);
  return { priority, label: (label || '').trim().toUpperCase() };
}

/**
 * Convert priority (1–5) to suggestedCount and severity for dispatch response.
 * @param {number} priority - 1–5
 * @returns {{ suggestedCount: number, severity: string, critical: boolean }}
 */
export function priorityToDispatch(priority) {
  const p = Math.min(5, Math.max(1, Math.floor(priority)));
  switch (p) {
    case 5:
      return { suggestedCount: 6, severity: 'critical', critical: true };
    case 4:
      return { suggestedCount: 4, severity: 'high', critical: false };
    case 3:
      return { suggestedCount: 2, severity: 'medium', critical: false };
    case 2:
      return { suggestedCount: 2, severity: 'low', critical: false };
    default:
      return { suggestedCount: 1, severity: 'low', critical: false };
  }
}
