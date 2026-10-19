// Sigma.js map of one system: waypoints at their API coordinates, orbit edges, and the agent's ships beside their waypoint.
import Sigma from 'https://cdn.jsdelivr.net/npm/sigma@3.0.3/+esm';
import Graph from 'https://cdn.jsdelivr.net/npm/graphology@0.26.0/+esm';
import { WAYPOINT_TYPES } from '../icons.js';

const LARGE_TYPES = new Set(['PLANET', 'GAS_GIANT']);
const MEDIUM_TYPES = new Set(['ORBITAL_STATION', 'JUMP_GATE', 'FUEL_STATION', 'ASTEROID_BASE']);

// Ship colors match navStatusLabel's pills; a bare IN_TRANSIT <mark> is azure-750 in Pico's dark theme.
const STATUS_COLORS = {
  DOCKED: 'pico-color-jade-500',
  IN_ORBIT: 'pico-color-azure-550',
  IN_TRANSIT: 'pico-color-azure-750',
};
const UNKNOWN_STATUS_COLOR = 'pico-color-slate-600';
// Labels, edges and dimmed nodes; a mid shade with alpha reads on Pico's dark and light backgrounds.
const NEUTRAL = 'pico-color-zinc-400';

/**
 * Reads a pico.colors class's custom property as a Sigma color, which takes strings, not classes.
 * @param {string} cls - a pico-color-{family}-{shade} class whose value is six-digit hex
 * @param {number} [alpha] - opacity from 0 to 1
 * @returns {string}
 */
function paletteColor(cls, alpha = 1) {
  // Empty only when pico.colors failed to load, and Sigma draws an empty string as black, so fall back to zinc-450.
  const hex = getComputedStyle(document.documentElement).getPropertyValue(`--${cls}`).trim() || '#7b8495';
  if (alpha === 1) return hex;
  // Sigma's WebGL canvas composites as premultiplied alpha, so a translucent color carries channels already scaled by alpha.
  const [r, g, b] = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * alpha));
  return `rgba(${r},${g},${b},${alpha})`;
}

function waypointColor(type) {
  return paletteColor((WAYPOINT_TYPES[type] ?? WAYPOINT_TYPES._default).color);
}

function waypointSize(type) {
  if (LARGE_TYPES.has(type)) return 14;
  if (MEDIUM_TYPES.has(type)) return 9;
  return 5;
}

let activeSigma = null;

/**
 * Renders the system into container, replacing any previous map.
 * @param {HTMLElement} container - div to render into (must have explicit height)
 * @param {object} systemData - system object with .waypoints[], .symbol
 * @param {Array} ships - player ships array (filtered to this system)
 */
export function renderSystemMap(container, systemData, ships) {
  killMap();

  const waypoints = systemData.waypoints;
  if (!waypoints || waypoints.length === 0) return;

  const systemPrefix = systemData.symbol + '-';
  const graph = new Graph();
  const edgeColor = paletteColor(NEUTRAL, 0.25);
  const dimmedColor = paletteColor(NEUTRAL, 0.3);
  const highlightedEdgeColor = paletteColor(NEUTRAL, 0.8);

  for (const wp of waypoints) {
    graph.addNode(wp.symbol, {
      x: wp.x,
      y: wp.y,
      size: waypointSize(wp.type),
      color: waypointColor(wp.type),
      label: wp.symbol.replace(systemPrefix, ''),
      nodeType: 'waypoint',
    });
  }

  for (const wp of waypoints) {
    if (wp.orbits && graph.hasNode(wp.orbits)) {
      graph.addEdge(wp.orbits, wp.symbol, {
        color: edgeColor,
        size: 1,
      });
    }
  }

  const shipsByWaypoint = Map.groupBy(ships, (s) => s.nav.waypointSymbol);

  for (const [wpSym, wpShips] of shipsByWaypoint) {
    if (!graph.hasNode(wpSym)) continue;
    const wpAttrs = graph.getNodeAttributes(wpSym);
    for (let i = 0; i < wpShips.length; i++) {
      const ship = wpShips[i];
      const angle = (2 * Math.PI * i) / wpShips.length - Math.PI / 2;
      const offset = wpAttrs.size * 0.3 + 2;
      graph.addNode(ship.symbol, {
        x: wpAttrs.x + Math.cos(angle) * offset,
        y: wpAttrs.y + Math.sin(angle) * offset,
        size: 3,
        color: paletteColor(STATUS_COLORS[ship.nav.status] ?? UNKNOWN_STATUS_COLOR),
        label: ship.symbol.replace(systemPrefix, ''),
        nodeType: 'ship',
      });
    }
  }

  activeSigma = new Sigma(graph, container, {
    labelColor: { color: paletteColor(NEUTRAL) },
    labelFont: 'system-ui, sans-serif',
    labelSize: 11,
    stagePadding: 40,
  });
  // Leaving the view must free the WebGL context and Sigma's window resize listener, which throws once the container is detached.
  window.addEventListener('hashchange', killMap, { once: true });

  activeSigma.on('clickNode', ({ node }) => {
    const attrs = graph.getNodeAttributes(node);
    if (attrs.nodeType === 'ship') {
      window.location.hash = `#/fleet/${node}`;
    } else {
      window.location.hash = `#/system/${systemData.symbol}/waypoint/${node}`;
    }
  });

  let hoveredNode = null;

  activeSigma.on('enterNode', ({ node }) => {
    hoveredNode = node;
    activeSigma.refresh();
  });

  activeSigma.on('leaveNode', () => {
    hoveredNode = null;
    activeSigma.refresh();
  });

  activeSigma.setSetting('nodeReducer', (node, data) => {
    const res = { ...data };
    if (hoveredNode) {
      if (node === hoveredNode) {
        res.highlighted = true;
        res.zIndex = 1;
      } else if (graph.hasEdge(node, hoveredNode) || graph.hasEdge(hoveredNode, node)) {
        res.highlighted = true;
      } else {
        res.color = dimmedColor;
        res.label = null;
      }
    }
    return res;
  });

  activeSigma.setSetting('edgeReducer', (edge, data) => {
    const res = { ...data };
    if (hoveredNode) {
      const src = graph.source(edge);
      const tgt = graph.target(edge);
      if (src !== hoveredNode && tgt !== hoveredNode) {
        res.hidden = true;
      } else {
        res.color = highlightedEdgeColor;
      }
    }
    return res;
  });
}

function killMap() {
  if (activeSigma) {
    activeSigma.kill();
    activeSigma = null;
  }
}
