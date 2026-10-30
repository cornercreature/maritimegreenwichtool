// Unit-sphere geometry. World axes: x = 90°E, y = north, z = 0° longitude.
export const RAD = Math.PI / 180;
export const GREENWICH = Object.freeze({ lat: 51.477806, lon: -0.001472 });
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const scale = (v, k) => ({ x: v.x * k, y: v.y * k, z: v.z * k });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const norm = v => Math.hypot(v.x, v.y, v.z);
export const normalize = v => scale(v, 1 / norm(v));
export const wrapLongitude = lon => ((lon + 180) % 360 + 360) % 360 - 180;

export function toVector({ lat, lon }) {
  const p = lat * RAD, l = lon * RAD;
  return { x: Math.cos(p) * Math.sin(l), y: Math.sin(p), z: Math.cos(p) * Math.cos(l) };
}

export function toCoordinates(v) {
  return { lat: Math.asin(clamp(v.y / norm(v), -1, 1)) / RAD, lon: wrapLongitude(Math.atan2(v.x, v.z) / RAD) };
}

export function viewBasis(lon = 0, lat = 0) {
  const l = lon * RAD, p = lat * RAD;
  return {
    right: { x: Math.cos(l), y: 0, z: -Math.sin(l) },
    up: { x: -Math.sin(p) * Math.sin(l), y: Math.cos(p), z: -Math.sin(p) * Math.cos(l) },
    forward: toVector({ lat, lon })
  };
}

export function project(v, basis) {
  return { x: dot(v, basis.right), y: -dot(v, basis.up), depth: dot(v, basis.forward) };
}

// Orthographic inverse. Off-disc drags clamp to the rim; the far side is never selected.
export function unproject(x, y, basis) {
  const r = Math.hypot(x, y);
  if (r > 1) { x /= r; y /= r; }
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  return normalize(add(add(scale(basis.right, x), scale(basis.up, -y)), scale(basis.forward, z)));
}

// Tangent of the shortest great-circle route at p: reject g's radial component.
export function bearingGeometry(position, target = GREENWICH) {
  const p = toVector(position), g = toVector(target);
  const cosine = clamp(dot(p, g), -1, 1);
  const raw = add(g, scale(p, -cosine));
  const sine = norm(raw);
  const angularDistance = Math.atan2(sine, cosine);
  const distanceNm = angularDistance / RAD * 60;
  if (sine < 1e-10) return { tangent: null, bearing: null, angularDistance, distanceNm, status: cosine > 0 ? 'at-target' : 'antipode' };
  const tangent = scale(raw, 1 / sine);
  const east = { x: Math.cos(position.lon * RAD), y: 0, z: -Math.sin(position.lon * RAD) };
  const north = { x: -Math.sin(position.lat * RAD) * Math.sin(position.lon * RAD), y: Math.cos(position.lat * RAD), z: -Math.sin(position.lat * RAD) * Math.cos(position.lon * RAD) };
  const bearing = (Math.atan2(dot(tangent, east), dot(tangent, north)) / RAD + 360) % 360;
  return { tangent, bearing, angularDistance, distanceNm, status: 'ok' };
}

export function screenDirection(tangent, basis) {
  if (!tangent) return null;
  const v = project(tangent, basis), length = Math.hypot(v.x, v.y);
  return length < 1e-8 ? null : { x: v.x / length, y: v.y / length };
}
