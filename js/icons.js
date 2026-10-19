// Icon lookup for API enums: icons.json maps each value to a Font Awesome icon and a pico.colors class, with a _default per category.
import data from '../icons.json' with { type: 'json' };

export const {
  shipFrames: SHIP_FRAMES,
  factions: FACTIONS,
  waypointTypes: WAYPOINT_TYPES,
  starTypes: STAR_TYPES,
} = data;

const warned = new Set();

/** Returns the <i> for key, falling back to map._default and warning once per unmapped key. */
export function icon(map, key) {
  let entry = map[key];
  if (!entry) {
    if (key && !warned.has(key)) {
      warned.add(key);
      console.warn(`[icons] Unmapped key: "${key}" — using default`);
    }
    entry = map._default;
  }
  return `<i class="fa-solid ${entry.icon} ${entry.color}" aria-hidden="true"></i>`;
}
