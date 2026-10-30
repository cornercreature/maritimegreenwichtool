import { GREENWICH, clamp, wrapLongitude, toVector, toCoordinates, viewBasis, project, unproject, bearingGeometry, screenDirection } from './navigation.js';

const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const CENTER = 500, RADIUS = 405;
const defaults = Object.freeze({ lat: -10, lon: -25, rotation: 0, tilt: 0, pointSize: 42, lineWidth: 10, lineLength: 100, grid: false, reference: false, data: false });
const sliders = ['rotation', 'tilt', 'pointSize', 'lineWidth', 'lineLength'];
const toggles = ['grid', 'reference', 'data'];
let state = { ...defaults };
try {
  const saved = JSON.parse(localStorage.getItem('greenwich-studio-v1'));
  if (saved && typeof saved === 'object') {
    for (const key of ['lat', 'lon', ...sliders]) {
      if (!Number.isFinite(saved[key])) continue;
      const bounds = key === 'lat' ? [-90, 90] : key === 'lon' ? [-180, 180] : [+$(key).min, +$(key).max];
      state[key] = clamp(saved[key], ...bounds);
    }
    for (const key of toggles) if (typeof saved[key] === 'boolean') state[key] = saved[key];
  }
} catch { /* The tool works normally when browser storage is unavailable. */ }

const svgElement = (tag, attrs = {}, text) => {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
};
const formatCoordinate = (value, latitude, places = 2) => `${Math.abs(value).toFixed(places)}° ${latitude ? value < 0 ? 'S' : 'N' : value < 0 ? 'W' : 'E'}`;
const setHidden = (element, value) => element.toggleAttribute('hidden', value);
let frame = null, dragging = false, lastGridView = null;
const requestRender = () => { if (frame === null) frame = requestAnimationFrame(() => { frame = null; render(); }); };
const persist = () => { try { localStorage.setItem('greenwich-studio-v1', JSON.stringify(state)); } catch {} };

function syncControls() {
  for (const key of sliders) $(key).value = state[key];
  for (const key of toggles) $(key).checked = state[key];
}

function updateControls() {
  for (const key of sliders) {
    const input = $(key);
    input.style.setProperty('--fill', `${100 * (state[key] - +input.min) / (+input.max - +input.min)}%`);
    let label;
    if (key === 'rotation') label = Math.abs(state[key]) < 0.05 ? '0°' : formatCoordinate(state[key], false, 1);
    else if (key === 'tilt') label = Math.abs(state[key]) < 0.05 ? '0°' : formatCoordinate(state[key], true, 1);
    else label = `${state[key]}${key === 'lineLength' ? '%' : ''}`;
    $(`${key}-value`).textContent = label;
    input.setAttribute('aria-valuetext', key === 'lineLength' ? `${state[key]} percent of globe diameter` : label);
  }
}

// Clip a geographic curve to the front hemisphere, bisecting horizon crossings.
function geographicPath(points, basis) {
  let d = '', prev = null;
  for (const coordinate of points) {
    const current = { coordinate, p: project(toVector(coordinate), basis) };
    if (prev && (prev.p.depth >= 0) !== (current.p.depth >= 0)) {
      let a = prev.coordinate, b = current.coordinate;
      for (let i = 0; i < 22; i++) {
        const m = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
        if ((project(toVector(m), basis).depth >= 0) === (prev.p.depth >= 0)) a = m; else b = m;
      }
      const h = project(toVector({ lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 }), basis);
      d += `${prev.p.depth >= 0 ? 'L' : 'M'}${(CENTER + h.x * RADIUS).toFixed(3)},${(CENTER + h.y * RADIUS).toFixed(3)} `;
    }
    if (current.p.depth >= 0) {
      d += `${!prev || prev.p.depth < 0 && !d ? 'M' : 'L'}${(CENTER + current.p.x * RADIUS).toFixed(3)},${(CENTER + current.p.y * RADIUS).toFixed(3)} `;
    }
    prev = current;
  }
  return d;
}

function renderGrid(basis) {
  const viewKey = `${state.rotation}/${state.tilt}`;
  if (viewKey === lastGridView) return;
  lastGridView = viewKey;
  const layer = $('grid-layer');
  layer.replaceChildren();
  for (let lat = -60; lat <= 60; lat += 30) {
    const points = Array.from({ length: 181 }, (_, i) => ({ lat, lon: -180 + i * 2 }));
    layer.append(svgElement('path', { d: geographicPath(points, basis), 'stroke-opacity': lat === 0 ? '.32' : '.19' }));
  }
  for (let lon = -180; lon < 180; lon += 30) {
    const points = Array.from({ length: 91 }, (_, i) => ({ lat: -90 + i * 2, lon }));
    layer.append(svgElement('path', { d: geographicPath(points, basis), 'stroke-opacity': lon === 0 ? '.32' : '.19' }));
  }
  layer.setAttribute('stroke-opacity', '1');
}

function renderReference(basis) {
  const layer = $('reference-layer');
  layer.replaceChildren();
  const g = project(toVector(GREENWICH), basis);
  if (g.depth < -1e-9) return;
  const x = CENTER + g.x * RADIUS, y = CENTER + g.y * RADIUS;
  const labelLeft = x > 690;
  layer.append(
    svgElement('circle', { cx: x, cy: y, r: 10, fill: '#2e3593', stroke: '#d7e7b6', 'stroke-width': 2 }),
    svgElement('circle', { cx: x, cy: y, r: 3, fill: '#d7e7b6' }),
    svgElement('text', { x: x + (labelLeft ? -19 : 19), y: y + (y < 140 ? 29 : -17), fill: '#d7e7b6', 'font-size': 11, 'font-family': 'monospace', 'letter-spacing': 1.8, 'text-anchor': labelLeft ? 'end' : 'start', 'paint-order': 'stroke', stroke: '#2e3593', 'stroke-width': 4, 'stroke-linejoin': 'round' }, 'GREENWICH')
  );
}

function render() {
  const basis = viewBasis(state.rotation, state.tilt);
  const p = project(toVector(state), basis);
  const visible = p.depth >= -1e-9;
  const x = CENTER + p.x * RADIUS, y = CENTER + p.y * RADIUS;
  const geometry = bearingGeometry(state);
  const direction = screenDirection(geometry.tangent, basis);
  updateControls();
  $('point').setAttribute('cx', x);
  $('point').setAttribute('cy', y);
  $('point').setAttribute('r', state.pointSize / 2);
  $('point').setAttribute('aria-valuenow', state.lat.toFixed(3));
  $('point').setAttribute('aria-valuetext', `${formatCoordinate(state.lat, true)}, ${formatCoordinate(state.lon, false)}. Arrow keys move one degree; Shift moves five.`);
  setHidden($('point'), !visible);
  setHidden($('bearing-line'), !visible || !direction);
  if (direction) {
    const half = RADIUS * state.lineLength / 100;
    for (const [key, value] of Object.entries({ x1: x - direction.x * half, y1: y - direction.y * half, x2: x + direction.x * half, y2: y + direction.y * half, 'stroke-width': state.lineWidth })) $('bearing-line').setAttribute(key, value);
  }

  setHidden($('grid-layer'), !state.grid);
  if (state.grid) renderGrid(basis);
  setHidden($('reference-layer'), !state.reference);
  if (state.reference) renderReference(basis);

  const directionLayer = $('direction-layer');
  directionLayer.replaceChildren();
  setHidden(directionLayer, !state.data || !visible || !direction);
  if (state.data && direction && visible) {
    // Arrowhead is an optional cue for which half of the undirected white line points toward Greenwich.
    const along = Math.min(85, RADIUS * state.lineLength / 100 * 0.75);
    const ax = x + direction.x * along, ay = y + direction.y * along;
    const size = 9 + state.lineWidth / 3;
    directionLayer.append(svgElement('path', { d: `M${ax - direction.x * size - direction.y * size * .65},${ay - direction.y * size + direction.x * size * .65} L${ax},${ay} L${ax - direction.x * size + direction.y * size * .65},${ay - direction.y * size - direction.x * size * .65}`, fill: 'none', stroke: '#d7e7b6', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }

  setHidden($('return-notice'), visible);
  $('notice-text').textContent = 'Your point is on the far side.';
  $('view-label').textContent = Math.abs(state.tilt) < 0.05 ? 'NORTH UP' : `TILT ${formatCoordinate(state.tilt, true, 1)}`;
  setHidden($('navigation-panel'), !state.data);
  $('latitude').textContent = formatCoordinate(state.lat, true);
  $('longitude').textContent = formatCoordinate(state.lon, false);
  $('bearing').textContent = geometry.bearing === null ? 'Undefined' : `${(Math.round(geometry.bearing * 10) / 10 % 360).toFixed(1)}°`;
  $('distance').textContent = `${Math.round(geometry.distanceNm).toLocaleString('en-US')} nm`;
  const greenwichVisible = project(toVector(GREENWICH), basis).depth >= -1e-9;
  let status = 'Initial great-circle bearing · nautical miles';
  if (state.reference && !greenwichVisible) status += ' · Greenwich is on the far side';
  let hint = 'Drag the point. Rotate to explore.';
  if (!visible) hint = 'Rotate the globe to bring your point back.';
  else if (geometry.status === 'at-target') hint = status = 'At Greenwich · no unique bearing';
  else if (geometry.status === 'antipode') hint = status = 'Opposite Greenwich · no unique shortest route';
  else if (!direction) hint = status = 'Bearing points into the screen · rotate the view';
  $('navigation-status').textContent = status;
  const hintNode = $('interaction-hint').lastChild;
  if (hintNode.nodeType === Node.TEXT_NODE) hintNode.textContent = hint;
  persist();
}

function pointFromEvent(event) {
  const matrix = $('scene').getScreenCTM();
  if (!matrix) return null;
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}

function movePoint(event) {
  const coordinate = pointFromEvent(event);
  if (!coordinate) return;
  const v = unproject((coordinate.x - CENTER) / RADIUS, (coordinate.y - CENTER) / RADIUS, viewBasis(state.rotation, state.tilt));
  const geographic = toCoordinates(v);
  // At a geographic pole, preserve longitude because atan2(0,0) carries no direction.
  state.lat = geographic.lat;
  if (Math.abs(state.lat) < 89.999999) state.lon = geographic.lon;
  requestRender();
}

$('scene').addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0) return;
  const coordinate = pointFromEvent(event);
  if (!coordinate || (Math.hypot(coordinate.x - CENTER, coordinate.y - CENTER) > RADIUS && event.target !== $('point'))) return;
  event.preventDefault();
  dragging = true;
  $('scene').setPointerCapture(event.pointerId);
  $('point').classList.add('dragging');
  $('point').focus({ preventScroll: true });
  movePoint(event);
});
$('scene').addEventListener('pointermove', event => { if (dragging && event.isPrimary) movePoint(event); });
const stopDragging = () => {
  if (!dragging) return;
  dragging = false;
  $('point').classList.remove('dragging');
  $('announcement').textContent = `Point moved to ${formatCoordinate(state.lat, true)}, ${formatCoordinate(state.lon, false)}.`;
};
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) $('scene').addEventListener(name, stopDragging);
$('point').addEventListener('keydown', event => {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  event.preventDefault();
  const step = event.shiftKey ? 5 : 1;
  if (event.key === 'ArrowUp') state.lat = clamp(state.lat + step, -90, 90);
  if (event.key === 'ArrowDown') state.lat = clamp(state.lat - step, -90, 90);
  if (event.key === 'ArrowLeft') state.lon = wrapLongitude(state.lon - step);
  if (event.key === 'ArrowRight') state.lon = wrapLongitude(state.lon + step);
  requestRender();
});
for (const key of sliders) $(key).addEventListener('input', () => { state[key] = +$(key).value; requestRender(); });
for (const key of toggles) $(key).addEventListener('change', () => { state[key] = $(key).checked; requestRender(); });
$('reset').addEventListener('click', () => { state = { ...defaults }; lastGridView = null; syncControls(); render(); $('announcement').textContent = 'Globe, point, style, and overlays reset.'; });
$('find-point').addEventListener('click', () => { state.rotation = state.lon; state.tilt = state.lat; syncControls(); render(); $('announcement').textContent = 'Globe centered on your point.'; });
$('about').addEventListener('click', () => $('method-dialog').showModal());
$('close-about').addEventListener('click', () => $('method-dialog').close());
$('method-dialog').addEventListener('click', event => { if (event.target !== $('method-dialog')) return; const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); });

$('export').addEventListener('click', () => {
  render();
  const clone = $('scene').cloneNode(true);
  clone.setAttribute('xmlns', NS);
  clone.setAttribute('width', '1600'); clone.setAttribute('height', '1600');
  clone.removeAttribute('id'); clone.removeAttribute('aria-labelledby');
  clone.querySelectorAll('[hidden]').forEach(element => element.remove());
  clone.querySelectorAll('[tabindex]').forEach(element => { element.removeAttribute('tabindex'); element.removeAttribute('role'); element.removeAttribute('class'); });
  clone.insertBefore(svgElement('rect', { x: 0, y: 0, width: 1000, height: 1000, fill: '#eeefec' }), clone.querySelector('defs'));
  const desc = clone.querySelector('desc');
  desc.textContent = `Spherical initial bearing from ${state.lat.toFixed(6)}, ${state.lon.toFixed(6)} toward the Airy Transit Circle, Greenwich. View center: ${state.tilt}, ${state.rotation}.`;
  // Long lines are cropped to the square artwork, matching the on-screen artboard.
  clone.setAttribute('style', 'overflow:hidden');
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'greenwich-bearing.svg'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  $('announcement').textContent = 'SVG artwork exported.';
});

syncControls();
render();
