type Point = { x: number; y: number };
const DEFAULT_COLOR = "#12151a";
export type Stroke = { points: Point[]; color: string };

export interface DrawStroke {
  color: string;
  points: Point[]; // relative to the complete drawing's bounding box
  sprite: HTMLCanvasElement; // only this stroke, on transparent pixels
  x: number; // crop origin in the same coordinates as points
  y: number;
  width: number;
  height: number;
  area: number; // bounding-box area before padding
}

export interface DrawResult {
  points: { x: number; y: number }[];
  sprite: HTMLCanvasElement; // the raw drawing, cropped to its bounding box
  width: number;
  height: number;
  strokes: DrawStroke[];
}

function bounds(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function paintStroke(ctx: CanvasRenderingContext2D, points: Point[], color: string, x = 0, y = 0, close = false) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(points[0].x - x, points[0].y - y);
  for (const p of points) ctx.lineTo(p.x - x, p.y - y);
  if (close) ctx.closePath();
  ctx.stroke();
}

export class DrawPad {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawing = false;
  private strokes: Stroke[] = [];
  private color = DEFAULT_COLOR;
  private activePointer: number | null = null;
  private last: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;
    this.reset();
    this.bind();
  }

  reset() {
    this.strokes = [];
    this.drawing = false;
    this.activePointer = null;
    this.last = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = this.color;
    this.ctx.lineWidth = 8;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  hasEnoughInk(): boolean {
    return this.strokes.reduce((total, stroke) => total + stroke.points.length, 0) >= 8;
  }

  setColor(color: string) {
    this.color = color;
    this.ctx.strokeStyle = color;
  }

  private toLocal(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  private bind() {
    const start = (x: number, y: number) => {
      this.drawing = true;
      this.last = { x, y };
      const stroke = { points: [{ x, y }], color: this.color };
      this.strokes.push(stroke);
      paintStroke(this.ctx, stroke.points, stroke.color);
    };
    const move = (x: number, y: number) => {
      if (!this.drawing || !this.last) return;
      const stroke = this.strokes[this.strokes.length - 1];
      this.ctx.strokeStyle = stroke.color;
      this.ctx.beginPath();
      this.ctx.moveTo(this.last.x, this.last.y);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
      this.last = { x, y };
      stroke.points.push({ x, y });
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.activePointer) return;
      this.drawing = false;
      this.last = null;
      this.activePointer = null;
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      if (this.activePointer !== null) return;
      this.activePointer = e.pointerId;
      this.canvas.setPointerCapture(e.pointerId);
      const p = this.toLocal(e.clientX, e.clientY);
      start(p.x, p.y);
    });
    this.canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.activePointer) return;
      const p = this.toLocal(e.clientX, e.clientY);
      move(p.x, p.y);
    });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  borrowSample() {
    this.reset();
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const body = [
      { x: cx - 110, y: cy - 10 },
      { x: cx - 60, y: cy - 55 },
      { x: cx + 10, y: cy - 60 },
      { x: cx + 70, y: cy - 40 },
      { x: cx + 120, y: cy - 5 },
      { x: cx + 100, y: cy + 40 },
      { x: cx + 40, y: cy + 65 },
      { x: cx - 40, y: cy + 60 },
      { x: cx - 100, y: cy + 35 },
      { x: cx - 110, y: cy - 10 },
    ];
    this.strokes = [{ points: body, color: DEFAULT_COLOR }];
    for (let i = 0; i < 3; i++) {
      const x = cx - 65 + i * 65;
      const y = cy + (i === 1 ? 62 : 50);
      this.strokes.push({ points: [
        { x, y }, { x: x - 8, y: y + 18 },
        { x: x + 4, y: y + 35 }, { x: x + 20, y: y + 35 },
      ], color: DEFAULT_COLOR });
    }
    for (const stroke of this.strokes) paintStroke(this.ctx, stroke.points, stroke.color);
    this.ctx.strokeStyle = this.color;
  }

  extract(): DrawResult {
    return extractDrawing(this.strokes, this.canvas);
  }
}

export function restoreDrawing(strokes: Stroke[]): DrawResult {
  const canvas = document.createElement("canvas");
  const box = bounds(strokes.flatMap(s => s.points));
  canvas.width = Math.ceil(box.maxX) + 20;
  canvas.height = Math.ceil(box.maxY) + 20;
  const ctx = canvas.getContext("2d")!;
  for (const stroke of strokes) paintStroke(ctx, stroke.points, stroke.color);
  return extractDrawing(strokes, canvas);
}

function extractDrawing(strokes: Stroke[], canvas: HTMLCanvasElement): DrawResult {
  const allPoints = strokes.flatMap((stroke) => stroke.points);
  if (!allPoints.length) throw new Error("Cannot extract an empty drawing");
  const box = bounds(allPoints);
  const minX = Math.floor(box.minX) - 10;
  const minY = Math.floor(box.minY) - 10;
  const width = Math.max(40, Math.ceil(box.maxX) + 10 - minX);
  const height = Math.max(40, Math.ceil(box.maxY) + 10 - minY);

  const sprite = document.createElement("canvas");
  sprite.width = width;
  sprite.height = height;
  const sctx = sprite.getContext("2d")!;
  sctx.drawImage(canvas, minX, minY, width, height, 0, 0, width, height);

  const points = allPoints.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  // Match addPlayer's largest bounding-box area selection, including ties.
  const bodyStroke = strokes.reduce((largest, stroke) => {
    const a = bounds(largest.points), b = bounds(stroke.points);
    return (b.maxX - b.minX) * (b.maxY - b.minY) >
      (a.maxX - a.minX) * (a.maxY - a.minY) ? stroke : largest;
  });
  const first = bodyStroke.points[0], last = bodyStroke.points[bodyStroke.points.length - 1];
  const closeBody = Math.hypot(first.x - last.x, first.y - last.y) > 14;
  // Also close the combined sprite; never modify the hull input points.
  if (closeBody) paintStroke(sctx, [last, first], bodyStroke.color, minX, minY);
  const extractedStrokes = strokes.map((stroke): DrawStroke => {
    const b = bounds(stroke.points);
    const x = Math.floor(b.minX) - 10;
    const y = Math.floor(b.minY) - 10;
    const crop = document.createElement("canvas");
    crop.width = Math.ceil(b.maxX) + 10 - x;
    crop.height = Math.ceil(b.maxY) + 10 - y;
    // Repaint in isolation: copying from the pad would include intersecting strokes.
    paintStroke(crop.getContext("2d")!, stroke.points, stroke.color, x, y, stroke === bodyStroke && closeBody);
    return {
      color: stroke.color,
      points: stroke.points.map((p) => ({ x: p.x - minX, y: p.y - minY })),
      sprite: crop, x: x - minX, y: y - minY,
      width: crop.width, height: crop.height,
      area: (b.maxX - b.minX) * (b.maxY - b.minY),
    };
  });
  return { points, sprite, width, height, strokes: extractedStrokes };
}
