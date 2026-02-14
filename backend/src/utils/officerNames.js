/**
 * Fake officer names for simulated vehicles. Deterministic per unitId.
 */

const NAMES = [
  "Marcus Chen",
  "Sarah Johnson",
  "David Rodriguez",
  "Emily Watson",
  "James Martinez",
  "Maria Garcia",
  "Robert Kim",
  "Jennifer Lee",
  "Michael Thompson",
  "Amanda Foster",
  "Christopher Hayes",
  "Jessica Morgan",
  "Daniel Brooks",
  "Ashley Wright",
  "Matthew Sullivan",
  "Nicole Clarke",
  "Andrew Bennett",
  "Rachel Patterson",
  "Kevin Nguyen",
  "Lauren Cooper",
  "Brian Hughes",
  "Stephanie Reed",
  "Jason Rivera",
  "Megan Phillips",
  "Ryan Mitchell",
  "Heather Campbell",
  "Eric Turner",
  "Samantha Parker",
  "Justin Collins",
  "Christina Edwards",
  "Brandon Stewart",
  "Elizabeth Sanchez",
  "Tyler Morris",
  "Brittany Rogers",
  "Nathan Cook",
  "Amber Bell",
  "Aaron Murphy",
  "Rebecca Howard",
  "Kyle Ward",
  "Danielle Cox",
  "Scott Richardson",
  "Courtney Wood",
  "Gregory Barnes",
  "Tiffany Ross",
  "Patrick Henderson",
  "Kelly Jenkins",
  "Sean Perry",
  "Laura Powell",
  "Jonathan Long",
];

/** Simple string hash returning a non-negative integer. */
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** ~65% return true (en route), ~35% return false (idle/roaming). */
const STATUS_TRUE_THRESHOLD = 0.65;

/**
 * Get deterministic officer name and status for a vehicle unit.
 * @param {string} unitId - Vehicle id (e.g. "fire-1", "police-42")
 * @returns {{ name: string, status: boolean }}
 */
export function getOfficerForUnit(unitId) {
  const h = hash(unitId);
  const nameIdx = h % NAMES.length;
  const statusRand = (h >>> 16) / 0xffff;
  return {
    name: NAMES[nameIdx],
    status: statusRand < STATUS_TRUE_THRESHOLD,
  };
}
