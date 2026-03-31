import Sigma from 'https://cdn.jsdelivr.net/npm/sigma@3/+esm';
import Graph from 'https://cdn.jsdelivr.net/npm/graphology@0.25.4/+esm';
import { WAYPOINT_TYPES } from '../icons.js';

const LARGE_TYPES = new Set(['PLANET', 'GAS_GIANT']);
const MEDIUM_TYPES = new Set(['ORBITAL_STATION', 'JUMP_GATE', 'FUEL_STATION', 'ASTEROID_BASE']);

const STATUS_COLORS = {
  DOCKED: '#00c482',
  IN_ORBIT: '#3c71f7',
  IN_TRANSIT: '#f2df0d',
};

const colorCache = new Map();

function resolvePicoColor(picoClass) {
  if (!picoClass) return '#888';
  if (colorCache.has(picoClass)) return colorCache.get(picoClass);
  const el = document.createElement('span');
  el.className = picoClass;
  el.style.display = 'none';
  document.body.appendChild(el);
  const color = getComputedStyle(el).color;
  document.body.removeChild(el);
  colorCache.set(picoClass, color);
  return color;
}

function waypointColor(type) {
  const entry = WAYPOINT_TYPES[type] ?? WAYPOINT_TYPES._default;
  return resolvePicoColor(entry?.color);
}

function waypointSize(type) {
  if (LARGE_TYPES.has(type)) return 14;
  if (MEDIUM_TYPES.has(type)) return 9;
  return 5;
}

let activeSigma = null;

/**
 * Render a system map using Sigma.js.
 * @param {HTMLElement} container - div to render into (must have explicit height)
 * @param {object} systemData - system object with .waypoints[], .symbol
 * @param {Array} ships - player ships array (filtered to this system)
 */
export function renderSystemMap(container, systemData, ships) {
  // Kill previous instance
  if (activeSigma) {
    activeSigma.kill();
    activeSigma = null;
  }

  const waypoints = systemData.waypoints;
  if (!waypoints || waypoints.length === 0) return;

  const systemPrefix = systemData.symbol + '-';
  const graph = new Graph();

  // Add waypoint nodes
  for (const wp of waypoints) {
    graph.addNode(wp.symbol, {
      x: wp.x,
      y: wp.y,
      size: waypointSize(wp.type),
      color: waypointColor(wp.type),
      label: wp.symbol.replace(systemPrefix, ''),
      type: 'circle',
      nodeType: 'waypoint',
      waypointType: wp.type,
    });
  }

  // Add orbital edges
  for (const wp of waypoints) {
    if (wp.orbits && graph.hasNode(wp.orbits)) {
      graph.addEdge(wp.orbits, wp.symbol, {
        color: 'rgba(255,255,255,0.12)',
        size: 1,
      });
    }
  }

  // Add ship nodes (offset from their waypoint)
  const shipsByWaypoint = new Map();
  if (ships) {
    for (const ship of ships) {
      const wpSym = ship.nav.waypointSymbol;
      const list = shipsByWaypoint.get(wpSym) || [];
      list.push(ship);
      shipsByWaypoint.set(wpSym, list);
    }
  }

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
        color: STATUS_COLORS[ship.nav.status] || '#fff',
        label: ship.symbol.replace(systemPrefix, ''),
        type: 'circle',
        nodeType: 'ship',
      });
    }
  }

  // Create Sigma renderer
  activeSigma = new Sigma(graph, container, {
    labelRenderedSizeThreshold: 6,
    labelColor: { color: '#aaa' },
    labelFont: 'system-ui, sans-serif',
    labelSize: 11,
    defaultEdgeColor: 'rgba(255,255,255,0.12)',
    renderEdgeLabels: false,
    enableEdgeEvents: false,
    stagePadding: 40,
  });

  // Click: navigate to waypoint detail or ship detail
  activeSigma.on('clickNode', ({ node }) => {
    const attrs = graph.getNodeAttributes(node);
    if (attrs.nodeType === 'ship') {
      window.location.hash = `#/fleet/${node}`;
    } else {
      window.location.hash = `#/system/${systemData.symbol}/waypoint/${node}`;
    }
  });

  // Hover: highlight node
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
        res.color = 'rgba(255,255,255,0.15)';
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
        res.color = 'rgba(255,255,255,0.4)';
      }
    }
    return res;
  });

  return activeSigma;
}

export function killMap() {
  if (activeSigma) {
    activeSigma.kill();
    activeSigma = null;
  }
}
