import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { createRoom, validStrokes } from '../server/room.js';

const require = createRequire(import.meta.url);
async function load(relative) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext } }).outputText
    .replace('"matter-js"', JSON.stringify(pathToFileURL(require.resolve('matter-js')).href));
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}
// Rendering stubs only: Matter bodies, collisions, impulses and race loop are real.
const ctx = new Proxy({}, { get: (_target, key) => key === 'createLinearGradient'
  ? () => ({ addColorStop() {} }) : () => {} });
const canvas = () => ({ width: 1280, height: 720, getContext: () => ctx });
globalThis.document = { createElement: canvas };
let now = 1000, scheduled;
Object.defineProperty(globalThis, 'performance', { value: { now: () => now } });
globalThis.requestAnimationFrame = callback => { scheduled = callback; return 1; };
globalThis.cancelAnimationFrame = () => { scheduled = undefined; };
const { restoreDrawing } = await load('../src/draw.ts');
const { Race } = await load('../src/race.ts');
const strokes = [
  { color: '#ff5a36', points: [{x:10,y:10},{x:140,y:10},{x:150,y:80},{x:20,y:90},{x:10,y:10}] },
  { color: '#1f6feb', points: [{x:35,y:80},{x:30,y:110},{x:45,y:115}] },
  { color: '#8b5cf6', points: [{x:120,y:80},{x:125,y:110},{x:140,y:115}] },
];
test('room broadcasts full lists, starts exactly once at capacity, closes joins and resets', () => {
  const messages = [];
  const room = createRoom(2, message => messages.push(message));
  assert.equal(room.start(), false);
  const first = room.join({ name: 'Uno', strokes });
  const second = room.join({ name: 'Dos', strokes });
  assert.equal(first.status, 201);
  assert.notEqual(first.id, second.id);
  assert.deepEqual(messages.map(m => m.type), ['lobby', 'lobby', 'start']);
  assert.equal(messages[0].racers.length, 1);
  assert.equal(messages[2].racers.length, 2);
  assert.deepEqual(messages[2].racers[0].strokes, strokes);
  assert.equal(room.start(), false);
  assert.equal(room.join({ name: 'Tarde', strokes }).status, 409);
  room.reset();
  assert.equal(room.state().racers.length, 0);
  assert.equal(room.state().started, false);
});
test('manual room caps at six and rejects malformed drawings', () => {
  const room = createRoom(0, () => {});
  assert.equal(validStrokes([{color:'#12151a', points:Array(8).fill({x:2,y:3})}]), false);
  assert.equal(validStrokes([{color:'#12151a', points:[{x:0,y:0},{x:100,y:100}, ...Array(6).fill({x:50,y:50})]}]), false);
  assert.equal(room.join({ name: 'X', strokes: [] }).status, 400);
  assert.equal(room.join({ name: ' ', strokes }).status, 400);
  for (let i = 0; i < 6; i++) assert.equal(room.join({ name: `${i}`, strokes }).status, 201);
  assert.equal(room.state().started, false);
  assert.equal(room.join({ name: '7', strokes }).status, 409);
  assert.equal(room.start(), true);
});
for (const count of [2, 6]) test(`${count} physical entrants finish with independent bodies and legs`, () => {
  let result;
  const race = new Race(canvas(), { onTick() {}, onFinish() { assert.fail('individual callback'); },
    onAllFinish: rows => { result = rows; } });
  const entrants = Array.from({ length: count }, (_, i) => race.addEntrant(restoreDrawing(strokes), `Racer ${i}`));
  assert.equal(new Set(entrants.map(r => r.body)).size, count);
  assert.equal(new Set(entrants.map(r => r.body.collisionFilter.category)).size, count);
  assert.ok(entrants.every(r => r.legs.length === 2));
  assert.equal(restoreDrawing(strokes).strokes[1].color, '#1f6feb');
  race.start();
  for (let frame = 0; frame < 3700 && !result; frame++) {
    now += 1000 / 60;
    const callback = scheduled; scheduled = undefined; callback?.();
    assert.ok(entrants.every(r => Number.isFinite(r.body.position.x) && Math.abs(r.body.angle) <= 0.601));
  }
  assert.equal(result.length, count);
  assert.ok(result.every(r => r.timeMs > 0 && r.timeMs < 60000), JSON.stringify(result));
  assert.ok(result.every((r, i) => !i || r.timeMs >= result[i - 1].timeMs));
  assert.equal(scheduled, undefined);
});
test('standalone cheer still drives the original player to the finish', () => {
  let result;
  const race = new Race(canvas(), { onTick() {}, onFinish: r => { result = r; race.stop(); } });
  race.addPlayer(restoreDrawing(strokes), { text: 'AI Builders', color: '#ff5a36' });
  race.addComputer(7000);
  race.start();
  for (let frame = 0; frame < 3700 && !result; frame++) {
    now += 1000 / 60;
    if (frame % 10 === 0) race.cheer();
    const callback = scheduled; scheduled = undefined; callback?.();
  }
  assert.ok(result.timeMs < 60000);
  assert.ok(result.positions.length > 0);
  assert.equal(scheduled, undefined);
});
test('event time limit ranks unfinished entrants after arrivals', () => {
  let result;
  const race = new Race(canvas(), { onTick() {}, onFinish() {}, onAllFinish: rows => { result = rows; } });
  race.addEntrant(restoreDrawing(strokes), 'Corre');
  const stopped = race.addEntrant(restoreDrawing(strokes), 'Sin impulso');
  stopped.cadence = 0;
  race.start();
  for (let frame = 0; frame < 3700 && !result; frame++) {
    now += 1000 / 60;
    const callback = scheduled; scheduled = undefined; callback?.();
  }
  assert.equal(result.length, 2);
  assert.equal(result[0].name, 'Corre');
  assert.ok(result[0].timeMs > 0);
  assert.equal(result[1].name, 'Sin impulso');
  assert.equal(result[1].timeMs, undefined);
  assert.equal(scheduled, undefined);
});

test('room preserves selected stickers and accepts legacy clients without one', () => {
  const room = createRoom(0, () => {});
  assert.equal(room.join({ name: 'Sticker', strokes, sticker: 'CCNA' }).status, 201);
  assert.equal(room.state().racers[0].sticker, 'CCNA');
  assert.equal(room.join({ name: 'Legacy', strokes }).status, 201);
  assert.equal(room.state().racers[1].sticker, null);
  assert.equal(room.join({ name: 'Invalid', strokes, sticker: 'UNKNOWN' }).status, 400);
});

for (const sticker of ['CCNA', 'AWS', 'PMP', 'MKT', 'AIB', 'ACM', 'CYB', 'SIX']) {
  test(`${sticker} finishes with finite physics, bounded lean and intact flag`, () => {
    let result;
    const race = new Race(canvas(), { onTick() {}, onFinish() {}, onAllFinish: rows => { result = rows; } });
    const racer = race.addEntrant(restoreDrawing(strokes), sticker, sticker);
    assert.equal(racer.flagText, sticker);
    race.start();
    for (let frame = 0; frame < 3700 && !result; frame++) {
      now += 1000 / 60;
      const callback = scheduled; scheduled = undefined; callback?.();
      assert.ok(Number.isFinite(racer.body.position.x) && Number.isFinite(racer.body.position.y));
      assert.ok(Math.abs(racer.body.angle) <= 0.601);
    }
    assert.ok(result[0].timeMs > 0 && result[0].timeMs < 60000);
    assert.equal(result[0].sticker, sticker);
  });
}
