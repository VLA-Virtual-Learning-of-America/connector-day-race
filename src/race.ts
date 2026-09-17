import Matter from "matter-js";
import type { DrawResult } from "./draw";
import type { GhostRun } from "./storage";

const { Engine, World, Bodies, Body, Vertices } = Matter;

export const FINISH_X = 3200;
const START_X = 120;
const GROUND_Y = 420;
const SAMPLE_MS = 50;
const PHYSICS_STEP_MS = 1000 / 60;
const LEG_CADENCE = 1.8; // radians per second per Matter horizontal velocity unit
const UPRIGHT_STIFFNESS = 0.025; // tuned for the fixed 60 Hz physics step
const UPRIGHT_DAMPING = 0.22;
const MAX_BODY_ANGLE = 0.6;

export interface Perk {
  launchSpeed?: number; speed?: number; jump?: number; cooldown?: number;
  firstBoost?: number; upright?: number; friction?: number; gaitSmoothing?: number;
}
export const STICKERS = [
  { code: 'CCNA', name: 'Cisco CCNA', description: '+15% de velocidad en el primer segundo', perk: { launchSpeed: 1.15 } },
  { code: 'AWS', name: 'AWS Cloud Practitioner', description: 'Un salto un poquito más alto al alentar', perk: { jump: 1.15 } },
  { code: 'PMP', name: 'PMP', description: 'Menos espera entre tus toques de ¡Dale!', perk: { cooldown: 0.9 } },
  { code: 'MKT', name: 'Marketing Digital', description: 'Un empujón extra en el primer ¡Dale!', perk: { firstBoost: 1.15 } },
  { code: 'AIB', name: 'AI Builder Foundation', description: 'Recupera la postura un poquito más rápido', perk: { upright: 1.15 } },
  { code: 'ACM', name: 'AI Content Machine', description: '+10% de velocidad durante toda la carrera', perk: { speed: 1.1 } },
  { code: 'CYB', name: 'Ciberseguridad', description: 'Menos fricción para deslizar un poquito más', perk: { friction: 0.85 } },
  { code: 'SIX', name: 'Lean Six Sigma', description: 'Patas con ritmo más parejo · solo visual', perk: { gaitSmoothing: 0.15 } },
] as const;
export type StickerCode = typeof STICKERS[number]['code'];
export function stickerFor(code?: string | null) { return STICKERS.find(s => s.code === code); }

interface Spectator {
  side: number; depth: number; size: number; color: string; skin: string;
  phase: number; raised: boolean; flag?: string;
}

export interface FlagOptions {
  text: string; // e.g. "AI BUILDERS" or "VLA"
  color: string;
}

export interface EventResult { name: string; sticker?: StickerCode; timeMs?: number; distance: number }

export interface RaceCallbacks {
  onAllFinish?: (results: EventResult[]) => void;
  onTick: (elapsedMs: number, playerX: number) => void;
  onFinish: (result: { timeMs: number; positions: number[] }) => void;
}

interface Racer {
  id?: string;
  perk?: Perk;
  sticker?: StickerCode;
  cheered?: boolean;
  gaitSpeed?: number;
  grounded?: boolean;
  lastGroundedAt?: number;
  lastCheerAt?: number;
  legPhase?: number;
  cadence?: number;
  nextCheerAt?: number;
  body: Matter.Body | null; // null for kinematic ghosts (no physics needed)
  flagAnchor?: Matter.Body;
  flagConstraint?: Matter.Constraint;
  flagText?: string;
  flagColor?: string;
  kind: "player" | "ghost" | "computer";
  label: string;
  color: string;
  sprite?: HTMLCanvasElement;
  spriteW?: number;
  spriteH?: number;
  spriteX?: number;
  spriteY?: number;
  legs?: {
    sprite: HTMLCanvasElement;
    pivotX: number;
    pivotY: number;
    imageX: number;
    imageY: number;
    phaseOffset: number;
  }[];
  positions: number[]; // recorded/replay x offsets from START_X, sampled every SAMPLE_MS
  finished: boolean;
  finishTimeMs?: number;
}

export class Race {
  private engine = Engine.create();
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private racers: Racer[] = [];
  private player!: Racer;
  private eventMode = false;
  private startTime = 0;
  private lastSample = 0;
  private running = false;
  private cb: RaceCallbacks;
  private rafId = 0;
  private ground: Matter.Body;
  private spectators: Spectator[] = [];

  constructor(canvas: HTMLCanvasElement, cb: RaceCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;
    this.cb = cb;
    const colors = ['#ff5a36', '#1f6feb', '#8b5cf6', '#e5ad35', '#288573'];
    const skins = ['#f2c9a5', '#ba805c', '#704b3b'];
    const flags = ['VLA', ...STICKERS.map(s => s.code)];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) this.spectators.push({
        side, depth: 0.2 + i * 0.078, size: 0.85 + Math.random() * 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
        skin: skins[Math.floor(Math.random() * skins.length)],
        phase: Math.random() * Math.PI * 2, raised: i % 3 !== 0,
        flag: i % 4 === 1 ? flags[Math.floor(Math.random() * flags.length)] : undefined,
      });
    }
    this.engine.gravity.y = 1;

    this.ground = Bodies.rectangle(FINISH_X, GROUND_Y + 40, FINISH_X * 2, 80, {
      isStatic: true,
      friction: 0.9,
    });
    World.add(this.engine.world, [this.ground]);

    // "Grounded" gatea el impulso vertical del cheer: sin esto, tocar rápido y rítmico
    // (lo normal cuando alguien se emociona) acumula velocidad hacia arriba más rápido de lo
    // que la gravedad puede compensar entre toques, y la criatura sale disparada fuera de pantalla.
    Matter.Events.on(this.engine, "collisionStart", (event) => {
      for (const pair of event.pairs) {
        const racer = this.groundRacer(pair);
        if (racer) {
          racer.grounded = true;
          racer.lastGroundedAt = performance.now();
        }
      }
    });
    Matter.Events.on(this.engine, "collisionEnd", (event) => {
      for (const pair of event.pairs) {
        const racer = this.groundRacer(pair);
        if (racer) racer.grounded = false;
      }
    });
  }

  private groundRacer(pair: Matter.Pair) {
    const a = pair.bodyA.parent, b = pair.bodyB.parent;
    return this.racers.find(r => r.body &&
      ((a === r.body && b === this.ground) || (b === r.body && a === this.ground)));
  }

  addPlayer(draw: DrawResult, flag: FlagOptions, sticker?: StickerCode | null) {
    this.player = this.createRacer(draw, "Vos", flag, sticker);
  }

  addEntrant(draw: DrawResult, name: string, sticker?: StickerCode | null, id?: string) {
    this.eventMode = true;
    const racer = this.createRacer(draw, name, { text: name, color: draw.strokes[0].color }, sticker);
    racer.id = id;
    racer.cadence = 150 + Math.random() * 100;
    racer.nextCheerAt = Math.random() * 250;
    const category = 1 << this.racers.length;
    for (const body of [racer.body!, racer.flagAnchor!]) {
      body.collisionFilter.category = category;
      body.collisionFilter.mask = 1 | category;
    }
    return racer;
  }

  private createRacer(draw: DrawResult, name: string, flag: FlagOptions, sticker?: StickerCode | null): Racer {
    const selected = stickerFor(sticker);
    const perk: Perk | undefined = selected?.perk;
    const bodyStroke = draw.strokes.reduce((largest, stroke) =>
      stroke.area > largest.area ? stroke : largest,
    );
    const hull = Vertices.hull(bodyStroke.points as unknown as Matter.Vertex[]);
    const center = Vertices.centre(hull);
    // All crops and pivots share drawing coordinates; Matter recenters the hull
    // at its centroid, so subtract that same origin from every visual part.
    let left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const point of bodyStroke.points) {
      left = Math.min(left, point.x);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
    const legs = draw.strokes.filter((stroke) => stroke !== bodyStroke).map((stroke, i) => {
      let pivot = stroke.points[0];
      let nearest = Infinity;
      for (const point of stroke.points) {
        const dx = point.x - Math.max(left, Math.min(right, point.x));
        const dy = point.y - bottom;
        const distance = dx * dx + dy * dy;
        if (distance < nearest) {
          nearest = distance;
          pivot = point;
        }
      }
      return {
        sprite: stroke.sprite,
        pivotX: pivot.x - center.x, pivotY: pivot.y - center.y,
        imageX: stroke.x - pivot.x, imageY: stroke.y - pivot.y,
        phaseOffset: i * Math.PI / 2,
      };
    });
    const body = Bodies.fromVertices(
      START_X,
      GROUND_Y - draw.height / 2,
      [hull] as unknown as Matter.Vector[][],
      {
        friction: 0.6 * (perk?.friction ?? 1),
        frictionAir: 0.02,
        restitution: 0.15,
        density: 0.0018,
      },
      true,
    );
    Body.setPosition(body, { x: START_X, y: GROUND_Y - draw.height / 2 });

    const flagAnchor = Bodies.circle(START_X, GROUND_Y - draw.height, 4, {
      density: 0.0004,
      frictionAir: 0.05,
    });
    const flagConstraint = Matter.Constraint.create({
      bodyA: body,
      pointA: { x: draw.width * 0.25, y: -draw.height * 0.3 },
      bodyB: flagAnchor,
      stiffness: 0.06,
      length: 26,
    });

    World.add(this.engine.world, [body, flagAnchor, flagConstraint]);

    const racer: Racer = {
      perk, sticker: selected?.code,
      grounded: true, lastGroundedAt: 0, lastCheerAt: 0, legPhase: 0,
      body,
      flagAnchor,
      flagConstraint,
      flagText: (selected?.code ?? flag.text.trim().split(/\s+/)[0]).slice(0, 4).toUpperCase(),
      flagColor: flag.color,
      kind: "player",
      label: name,
      color: "#ff5a36",
      sprite: bodyStroke.sprite,
      spriteW: draw.width,
      spriteH: draw.height,
      spriteX: bodyStroke.x - center.x,
      spriteY: bodyStroke.y - center.y,
      legs,
      positions: [],
      finished: false,
    };
    this.racers.push(racer);
    return racer;
  }

  addGhost(run: GhostRun, color = "#9aa3ad") {
    this.racers.push({
      body: null,
      kind: "ghost",
      label: run.name || "Fantasma",
      color,
      positions: run.positions,
      finished: false,
    });
  }

  addComputer(targetTimeMs: number, color = "#1f6feb") {
    // Procedural pacing: not literal physics, a believable jittery run to a target finish time.
    const positions: number[] = [];
    const totalSamples = Math.ceil(targetTimeMs / SAMPLE_MS) + 4;
    for (let i = 0; i <= totalSamples; i++) {
      const t = i / totalSamples;
      const eased = 1 - Math.pow(1 - t, 1.6);
      const jitter = Math.sin(i * 1.3) * 8;
      positions.push(Math.min(FINISH_X - START_X, eased * (FINISH_X - START_X) + jitter));
    }
    this.racers.push({
      body: null,
      kind: "computer",
      label: "Computadora",
      color,
      positions,
      finished: false,
    });
  }

  cheer() {
    if (this.player) this.cheerRacer(this.player);
  }

  cheerEntrant(id: string) {
    const racer = this.racers.find(r => r.id === id);
    if (racer) this.cheerRacer(racer);
  }

  private cheerRacer(racer: Racer) {
    const now = performance.now();
    if (!this.running) return;
    if (now - (racer.lastCheerAt ?? -Infinity) < 110 * (racer.perk?.cooldown ?? 1)) return;
    racer.lastCheerAt = now;
    const body = racer.body;
    if (!body || racer.finished) return;

    const coyoteMs = 90; // margen para que el toque no se sienta injusto al despegar
    const canJump = racer.grounded || performance.now() - (racer.lastGroundedAt ?? 0) < coyoteMs;

    const boostX = (3.4 + Math.random() * 1.4) * (!racer.cheered ? racer.perk?.firstBoost ?? 1 : 1);
    racer.cheered = true;
    const MAX_VX = 15;
    if (canJump) {
      const boostY = (-2.6 - Math.random() * 1.0) * (racer.perk?.jump ?? 1);
      Body.setVelocity(body, {
        x: Math.min(MAX_VX, body.velocity.x + boostX),
        y: body.velocity.y + boostY,
      });
    } else {
      // En el aire: solo un pequeño empujón horizontal, nada de más altura.
      Body.setVelocity(body, {
        x: Math.min(MAX_VX, body.velocity.x + boostX * 0.35),
        y: body.velocity.y,
      });
    }
    // Un toque de giro aleatorio para que se sienta orgánico, sin que domine la traslación.
    Body.setAngularVelocity(body, body.angularVelocity + (Math.random() - 0.5) * 0.008);
  }

  start() {
    this.running = true;
    this.startTime = performance.now();
    this.lastSample = 0;
    for (const r of this.racers) { r.legPhase = 0; r.lastCheerAt = -Infinity; r.cheered = false; }
    const loop = () => {
      if (!this.running) return;
      const elapsed = performance.now() - this.startTime;
      for (const r of this.racers) {
        const body = r.body;
        if (r.cadence && !r.finished && elapsed >= r.nextCheerAt!) {
          this.cheerRacer(r);
          r.nextCheerAt = elapsed + r.cadence * (0.8 + Math.random() * 0.4);
        }
        if (body) {
          // A damped spring keeps the hull upright while allowing a running lean.
          const targetAngle = Math.min(1, Math.max(0, body.velocity.x) / 10) * 0.2;
          const angleError = targetAngle - body.angle;
          const correctiveTorque = angleError * UPRIGHT_STIFFNESS * (r.perk?.upright ?? 1) - body.angularVelocity * UPRIGHT_DAMPING;
          Body.setAngularVelocity(body, body.angularVelocity + correctiveTorque);
        }
      }
      Engine.update(this.engine, PHYSICS_STEP_MS);
      // Scale horizontal travel once per step, without compounding velocity or affecting jumps.
      // Translate preserves Matter's baseline velocity and existing impulse limits.
      for (const r of this.racers) {
        if (!r.body || r.finished) continue;
        const speed = (r.perk?.speed ?? 1) * (elapsed <= 1000 ? r.perk?.launchSpeed ?? 1 : 1);
        if (speed !== 1 && r.body.velocity.x > 0) {
          const travel = { x: r.body.velocity.x * (speed - 1), y: 0 };
          Body.translate(r.body, travel);
          if (r.flagAnchor) Body.translate(r.flagAnchor, travel);
        }
      }
      const sample = elapsed - this.lastSample >= SAMPLE_MS;
      for (const r of this.racers) {
        const body = r.body;
        if (body && Math.abs(body.angle) > MAX_BODY_ANGLE) {
          // Catch collision spikes after integration, before rendering. Keep inward
          // rotation, but discard momentum that would push farther past the limit.
          const limit = Math.sign(body.angle) * MAX_BODY_ANGLE;
          const angularVelocity = body.angularVelocity;
          Body.setAngle(body, limit);
          if (angularVelocity * limit > 0) Body.setAngularVelocity(body, 0);
        }

        if (body) {
          // Follow the existing physics step so gait stays tied to body travel,
          // including on high-refresh displays or after a background-tab pause.
          let speed = Math.max(0, Math.abs(body.velocity.x) - 0.1);
          if (r.perk?.gaitSmoothing) {
            r.gaitSpeed = (r.gaitSpeed ?? speed) + (speed - (r.gaitSpeed ?? speed)) * r.perk.gaitSmoothing;
            speed = r.gaitSpeed;
          }
          r.legPhase = (r.legPhase! + speed * (PHYSICS_STEP_MS / 1000) * LEG_CADENCE) % (Math.PI * 2);
          const px = body.position.x - START_X;
          if (sample) {
            r.positions.push(Math.max(0, px));
          }
          if (!r.finished && body.position.x >= FINISH_X) {
            r.finished = true;
            r.finishTimeMs = elapsed;
            if (!this.eventMode) this.cb.onFinish({ timeMs: elapsed, positions: r.positions });
            else {
              Body.setStatic(body, true);
              if (r.flagAnchor) Body.setStatic(r.flagAnchor, true);
            }
          }
          if (!this.eventMode) this.cb.onTick(elapsed, body.position.x);
        }
      }
      if (sample) this.lastSample = elapsed;
      if (this.eventMode) this.cb.onTick(elapsed, 0);

      for (const r of this.racers) {
        if (r.kind === "player" || r.finished) continue;
        const idx = Math.min(r.positions.length - 1, Math.floor(elapsed / SAMPLE_MS));
        if (idx >= r.positions.length - 1) {
          r.finished = true;
          r.finishTimeMs = elapsed;
        }
      }

      this.render(elapsed);
      if (this.eventMode && (this.racers.every(r => r.finished) || elapsed >= 60000)) {
        this.stop();
        this.cb.onAllFinish?.(this.racers.map(r => ({ name: r.label, sticker: r.sticker,
          timeMs: r.finishTimeMs, distance: r.body!.position.x - START_X }))
          .sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity) || b.distance - a.distance));
        return;
      }
      if (this.running) this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  // Render-only projection: race distance controls depth, never physics.
  private project(worldX: number, laneOffset = 0) {
    const progress = Math.max(0, Math.min(1, worldX / FINISH_X));
    const scale = 1 - progress * 0.6;
    return {
      progress, scale,
      screenX: this.canvas.width / 2 + laneOffset * scale,
      screenY: this.canvas.height * (0.91 - progress * 0.69),
    };
  }

  private render(elapsed: number) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const halfWidth = canvas.width * 0.46;
    const near = this.project(0);
    const far = this.project(FINISH_X);
    const backdrop = ctx.createLinearGradient(0, 0, 0, canvas.height);
    backdrop.addColorStop(0, "#e6f1f4");
    backdrop.addColorStop(1, "#cee1c6");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.drawSpectators(elapsed);
    ctx.beginPath();
    ctx.moveTo(near.screenX - halfWidth, near.screenY);
    ctx.lineTo(far.screenX - halfWidth * far.scale, far.screenY);
    ctx.lineTo(far.screenX + halfWidth * far.scale, far.screenY);
    ctx.lineTo(near.screenX + halfWidth, near.screenY);
    ctx.closePath();
    ctx.fillStyle = "#f2dfbb";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();

    const laneWidth = halfWidth * 2 / this.racers.length;
    ctx.strokeStyle = "rgba(18,21,26,0.22)";
    ctx.lineWidth = 1.5;
    for (let i = 1; i < this.racers.length; i++) {
      const offset = -halfWidth + i * laneWidth;
      // Dashes shrink toward the finish with the same projection.
      for (let x = 0; x < FINISH_X; x += 200) {
        const a = this.project(x, offset);
        const b = this.project(x + 100, offset);
        ctx.beginPath();
        ctx.moveTo(a.screenX, a.screenY);
        ctx.lineTo(b.screenX, b.screenY);
        ctx.stroke();
      }
    }
    for (let x = 800; x < FINISH_X; x += 800) {
      const p = this.project(x);
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.fillRect(p.screenX - halfWidth * p.scale, p.screenY, halfWidth * 2 * p.scale, 2 * p.scale);
    }
    const finishWidth = halfWidth * 2 * far.scale;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 24; col++) {
        ctx.fillStyle = (row + col) % 2 ? "#ffffff" : "#12151a";
        ctx.fillRect(far.screenX - finishWidth / 2 + col * finishWidth / 24,
          far.screenY + row * 6, finishWidth / 24 + 0.5, 6);
      }
    }
    ctx.fillStyle = "#12151a";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("META", far.screenX, far.screenY - 12);

    // Far-to-near drawing order, without mutating the racers array.
    const visible = this.racers.map((r, i) => {
      const idx = Math.max(0, Math.min(r.positions.length - 1, Math.floor(elapsed / SAMPLE_MS)));
      const x = r.body?.position.x ?? START_X + (r.positions[idx] ?? 0);
      return { r, x, p: this.project(x, -halfWidth + laneWidth * (i + 0.5)) };
    }).sort((a, b) => b.x - a.x);
    for (const { r, x, p } of visible) {
      ctx.save();
      ctx.translate(p.screenX, p.screenY);
      ctx.scale(p.scale, p.scale);
      if (this.eventMode) {
        const fit = Math.min(1, laneWidth * 0.8 / Math.max(r.spriteW ?? 60, r.spriteH ?? 60));
        ctx.scale(fit, fit);
      }
      ctx.fillStyle = "rgba(18,21,26,0.18)";
      ctx.beginPath();
      ctx.ellipse(0, 3, r.kind === "player" ? Math.max(26, (r.spriteW ?? 60) * 0.42) : 30,
        9, 0, 0, Math.PI * 2);
      ctx.fill();
      if (r.kind === "player" && r.body) {
        // Preserve sprite, animated legs, flag offsets and physical jump height.
        ctx.translate(-x, -GROUND_Y);
        this.drawPlayer(r);
      } else {
        this.drawGhost(0, -30, r.color, r.label, r.finishTimeMs ?? elapsed);
      }
      ctx.restore();
      if (this.eventMode) {
        ctx.fillStyle = "#12151a";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(r.label, p.screenX, p.screenY + 24, laneWidth * p.scale * 0.95);
      }
    }
  }

  private drawSpectators(elapsed: number) {
    const { ctx, canvas } = this;
    for (const person of this.spectators) {
      const scale = 1 - person.depth * 0.6;
      const y = canvas.height * (0.91 - person.depth * 0.69);
      const edge = canvas.width * (0.5 + person.side * 0.46 * scale);
      const size = Math.min(canvas.width / 900, canvas.height / 460) * scale * person.size;
      const x = edge + person.side * 29 * size;
      const bounce = Math.sin(elapsed * 0.005 + person.phase);
      ctx.save(); ctx.translate(x, y); ctx.scale(size, size);
      ctx.fillStyle = '#b5aa94'; ctx.fillRect(-22, 0, 44, 7);
      ctx.translate(0, -2 - bounce * 2); ctx.rotate(bounce * 0.045);
      ctx.strokeStyle = '#12151a'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-5, -10); ctx.lineTo(-7, 0);
      ctx.moveTo(5, -10); ctx.lineTo(7, 0);
      ctx.moveTo(-8, -29); ctx.lineTo(-16, person.raised ? -40 : -16);
      ctx.moveTo(8, -29); ctx.lineTo(16, person.raised ? -41 : -17); ctx.stroke();
      ctx.fillStyle = person.color;
      ctx.beginPath(); ctx.moveTo(-7, -32); ctx.lineTo(7, -32);
      ctx.lineTo(10, -10); ctx.lineTo(-10, -10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = person.skin;
      ctx.beginPath(); ctx.ellipse(0, -40, 7, 8, 0, 0, Math.PI * 2); ctx.fill();
      if (person.flag) {
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(16, -18); ctx.lineTo(16, -68); ctx.stroke();
        ctx.fillStyle = person.color; ctx.fillRect(16, -68, 31, 15);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(person.flag, 31.5, -57, 29);
      }
      ctx.restore();
    }
  }

  private drawPlayer(r: Racer) {
    const { ctx } = this;
    const body = r.body!;
    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);
    if (r.sprite && r.spriteW && r.spriteH) {
      ctx.drawImage(r.sprite, r.spriteX!, r.spriteY!);
      const stride = Math.min(1, Math.max(0, Math.abs(body.velocity.x) - 0.1) / 4);
      if (r.legs?.length) {
        for (let i = 0; i < r.legs.length; i++) {
          const leg = r.legs[i];
          const angle = Math.sin(r.legPhase! + leg.phaseOffset) * 0.7 * stride;
          ctx.save();
          ctx.translate(leg.pivotX, leg.pivotY);
          ctx.rotate(angle);
          ctx.drawImage(leg.sprite, leg.imageX, leg.imageY);
          ctx.restore();
        }
      } else {
        this.drawLegs(r.spriteW, r.spriteH, r.legPhase!, stride, "#12151a");
      }
    }
    ctx.restore();

    if (r.flagAnchor && r.flagText !== undefined && r.flagColor !== undefined) {
      ctx.save();
      const a = r.flagAnchor.position;
      const b = body.position;
      ctx.strokeStyle = "#12151a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x + (r.spriteW ?? 0) * 0.2, b.y - (r.spriteH ?? 0) * 0.2);
      ctx.lineTo(a.x, a.y);
      ctx.stroke();

      ctx.translate(a.x, a.y);
      ctx.fillStyle = r.flagColor;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(34, -4);
      ctx.lineTo(0, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "white";
      ctx.font = "bold 7px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(r.flagText, 3, -1, 16);
      ctx.restore();
    }

    ctx.fillStyle = "#12151a";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    if (!this.eventMode) ctx.fillText(r.label, body.position.x, body.position.y - (r.spriteH ?? 60) / 2 - 12);
    ctx.textAlign = "left";

  }

  private drawLegs(width: number, height: number, phase: number, stride: number, color: string) {
    const { ctx } = this;
    const length = Math.max(18, Math.min(24, Math.min(width, height) * 0.24));
    const hipY = height / 2 - Math.min(8, height * 0.12);
    ctx.strokeStyle = color;
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    // Scalars only: no per-leg arrays, objects, bodies, or constraints per frame.
    for (let i = 0; i < 4; i++) {
      const hipX = (i - 1.5) * width * 0.2;
      const angle = (i - 1.5) * 0.12 + Math.sin(phase + i * Math.PI / 2) * 0.7 * stride;
      ctx.moveTo(hipX, hipY);
      ctx.lineTo(hipX + Math.sin(angle) * length, hipY + Math.cos(angle) * length);
    }
    ctx.stroke();
  }

  private drawGhost(x: number, y: number, color: string, label: string, elapsed: number) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.translate(x, y);
    this.drawLegs(52, 32, elapsed * 0.012, 1, color);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#12151a";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, 0, -22);
    ctx.textAlign = "left";
    ctx.restore();
  }
}
