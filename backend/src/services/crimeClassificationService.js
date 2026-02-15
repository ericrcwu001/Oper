/**
 * Rule-based classification of SF crime records.
 * Produces displayLabel and isUnknown for map labels.
 */

const UNKNOWN = 'UNKNOWN';

/** Categories that are too generic; use Descript for display when available. */
const GENERIC_CATEGORIES = new Set([
  'OTHER OFFENSES',
  'NON-CRIMINAL',
  'SECONDARY CODES',
]);

/**
 * Classify a crime record into a display label.
 * @param {{ category?: string, description?: string }} crime - category (CSV Category), description (CSV Descript)
 * @returns {{ displayLabel: string, isUnknown: boolean }}
 */
export function classifyCrime({ category, description }) {
  const cat = typeof category === 'string' ? category.trim() : '';
  const desc = typeof description === 'string' ? description.trim() : '';

  if (!cat && !desc) {
    return { displayLabel: UNKNOWN, isUnknown: true };
  }

  // Prefer descript when category is generic
  if (GENERIC_CATEGORIES.has(cat.toUpperCase()) && desc) {
    const label = desc.length > 40 ? `${desc.slice(0, 37)}...` : desc;
    return { displayLabel: label, isUnknown: false };
  }

  // Use category as primary display label
  if (cat) {
    return { displayLabel: cat, isUnknown: false };
  }

  // Fallback to descript
  const label = desc.length > 40 ? `${desc.slice(0, 37)}...` : desc;
  return { displayLabel: label || UNKNOWN, isUnknown: !label };
}
