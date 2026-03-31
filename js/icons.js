let SHIP_FRAMES = {};
let FACTIONS = {};
let WAYPOINT_TYPES = {};
let STAR_TYPES = {};

const ready = fetch('./icons.json')
  .then(r => r.json())
  .then(data => {
    SHIP_FRAMES = data.shipFrames;
    FACTIONS = data.factions;
    WAYPOINT_TYPES = data.waypointTypes;
    STAR_TYPES = data.starTypes;
  })
  .catch(err => console.error('Failed to load icons.json:', err));

export { SHIP_FRAMES, FACTIONS, WAYPOINT_TYPES, STAR_TYPES, ready };

const warned = new Set();

export function icon(map, key) {
  let entry = map[key];
  if (!entry) {
    if (key && !warned.has(key)) {
      warned.add(key);
      console.warn(`[icons] Unmapped key: "${key}" — using default`);
    }
    entry = map._default ?? { icon: 'fa-question', color: 'pico-color-primary' };
  }
  return `<i class="fa-solid ${entry.icon} ${entry.color}" aria-hidden="true"></i>`;
}
