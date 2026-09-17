export interface DrawResult {
  points: { x: number; y: number }[];
  sprite: HTMLCanvasElement; // the raw drawing, cropped to its bounding box
  width: number;
  height: number;
}

export class DrawPad {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private drawing = false;
  private strokes: { x: number; y: number }[] = [];
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
    this.last = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = "#12151a";
    this.ctx.lineWidth = 8;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  }

  hasEnoughInk(): boolean {
    return this.strokes.length >= 8;
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
      this.strokes.push({ x, y });
    };
    const move = (x: number, y: number) => {
      if (!this.drawing || !this.last) return;
      this.ctx.beginPath();
      this.ctx.moveTo(this.last.x, this.last.y);
      this.ctx.lineTo(x, y);
      this.ctx.stroke();
      this.last = { x, y };
      this.strokes.push({ x, y });
    };
    const end = () => {
      this.drawing = false;
      this.last = null;
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      this.canvas.setPointerCapture(e.pointerId);
      const p = this.toLocal(e.clientX, e.clientY);
      start(p.x, p.y);
    });
    this.canvas.addEventListener("pointermove", (e) => {
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
    this.ctx.beginPath();
    this.ctx.moveTo(body[0].x, body[0].y);
    for (const p of body.slice(1)) this.ctx.lineTo(p.x, p.y);
    this.ctx.stroke();
    this.strokes = body;
  }

  extract(): DrawResult {
    const xs = this.strokes.map((p) => p.x);
    const ys = this.strokes.map((p) => p.y);
    const minX = Math.min(...xs) - 10;
    const maxX = Math.max(...xs) + 10;
    const minY = Math.min(...ys) - 10;
    const maxY = Math.max(...ys) + 10;
    const width = Math.max(40, maxX - minX);
    const height = Math.max(40, maxY - minY);

    const sprite = document.createElement("canvas");
    sprite.width = width;
    sprite.height = height;
    const sctx = sprite.getContext("2d")!;
    sctx.drawImage(this.canvas, minX, minY, width, height, 0, 0, width, height);

    const points = this.strokes.map((p) => ({ x: p.x - minX, y: p.y - minY }));
    return { points, sprite, width, height };
  }
}
