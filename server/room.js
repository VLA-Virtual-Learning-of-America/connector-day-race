import { randomUUID } from 'node:crypto';
export const MAX_RACERS = 6;

// Bound payloads and reject degenerate hulls before accepting a racer.
export function validStrokes(strokes) {
  if (!Array.isArray(strokes) || !strokes.length || strokes.length > 64) return false;
  let total = 0;
  let largest = null;
  let area = -1;
  for (const s of strokes) {
    if (!s || !/^#[0-9a-f]{6}$/i.test(s.color) || !Array.isArray(s.points) || !s.points.length) return false;
    total += s.points.length;
    if (total > 12000) return false;
    if (!s.points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      p.x >= 0 && p.y >= 0 && p.x <= 600 && p.y <= 600)) return false;
    const xs = s.points.map(p => p.x), ys = s.points.map(p => p.y);
    const a = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (a > area) { area = a; largest = s.points; }
  }
  if (total < 8 || area < 100 || largest.length < 3) return false;
  const a = largest[0], b = largest.find(p => Math.hypot(p.x - a.x, p.y - a.y) > 2);
  return b && largest.some(p => Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)) > 20);
}


export function createRoom(autoStart, broadcast) {
  let racers = [];
  let started = false;
  const state = () => ({ type: 'lobby', racers, started, max: MAX_RACERS, autoStart });
  function start() {
    if (started || !racers.length) return false;
    started = true;
    broadcast({ type: 'start', racers });
    return true;
  }
  function join({ name, strokes, sticker = null } = {}) {
    if (started) return { status: 409, error: 'La carrera ya empezó. Esperá la próxima ronda.' };
    if (racers.length >= MAX_RACERS) return { status: 409, error: 'La sala está llena.' };
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 24 || !validStrokes(strokes)) {
      return { status: 400, error: 'Revisá el nombre y dibujá un cuerpo con superficie, no solo una línea.' };
    }
    if (sticker !== null && !['CCNA', 'AWS', 'PMP', 'MKT', 'AIB', 'ACM', 'CYB', 'SIX'].includes(sticker)) {
      return { status: 400, error: 'Elegí un sticker válido o Sin sticker.' };
    }
    const racer = { id: randomUUID(), name: name.trim(), sticker,
      strokes: strokes.map(s => ({ color: s.color, points: s.points.map(p => ({ x: p.x, y: p.y })) })) };
    racers = [...racers, racer];
    broadcast(state());
    if (autoStart && racers.length >= autoStart) start();
    return { status: 201, id: racer.id };
  }
  function reset() {
    racers = [];
    started = false;
    broadcast(state());
  }
  return { state, start, join, reset };
}
