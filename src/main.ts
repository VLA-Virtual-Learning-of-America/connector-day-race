import "./style.css";
import { stickerVisual, stickerName, prepareStickerImages } from './sticker-visuals';
import { DrawPad } from "./draw";
import { Race, FINISH_X, STICKERS, stickerFor, type StickerCode } from "./race";
import { snapSelfie } from "./camera";
import { generateCaption } from "./ai";
import { bestGhost, leaderboardTop, saveGhost, type GhostRun } from "./storage";

const params = new URLSearchParams(location.search);
if (params.get("host") === "1") {
  import("./event").then(({ mountHost }) => mountHost());
} else {
  mountDrawing(params.get("join") === "1");
}

function mountDrawing(joinMode: boolean) {
const COURSE_NAME = "AI Builders";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <section id="screen-intro" class="screen active">
    <span class="badge">Connector Day · VLA</span>
    <h1>Dibujá tu corredor 🐴</h1>
    <p class="subtitle">Sin cuenta, sin instalar nada. Dibujá cualquier criatura, dale nombre
      y hacela correr contra la computadora y contra los mejores tiempos del evento.</p>
    <div class="card">
      <button id="btn-start" class="primary">Empezar</button>
    </div>
    <p class="hint">Toca "Empezar" para dibujar en la pantalla</p>
  </section>

  <section id="screen-draw" class="screen">
    <h1>Dibujá tu criatura</h1>
    <p class="subtitle">Dibujá el cuerpo, soltá y agregá patas en trazos separados. ¡Esas patas se moverán al correr!</p>
    <canvas id="draw-canvas" width="480" height="360"></canvas>
    <div class="color-picker" role="group" aria-label="Color del trazo">
      <button type="button" class="color-swatch active" data-color="#12151a" style="--swatch: var(--vla-ink)" aria-label="Negro" aria-pressed="true" title="Negro"></button>
      <button type="button" class="color-swatch" data-color="#ff5a36" style="--swatch: var(--vla-accent)" aria-label="Naranja" aria-pressed="false" title="Naranja"></button>
      <button type="button" class="color-swatch" data-color="#1f6feb" style="--swatch: var(--vla-accent2)" aria-label="Azul" aria-pressed="false" title="Azul"></button>
      <button type="button" class="color-swatch" data-color="#8b5cf6" style="--swatch: #8b5cf6" aria-label="Violeta" aria-pressed="false" title="Violeta"></button>
    </div>
    <div class="toolbar">
      <button id="btn-clear">Borrar</button>
      <button id="btn-borrow">Prestame una</button>
      <button id="btn-done" class="primary">Ya está</button>
    </div>
  </section>

  <section id="screen-name" class="screen">
    <h1>Nombrá tu corredor</h1>
    <div class="card" style="display:flex;flex-direction:column;gap:14px;align-items:center;">
      <input id="input-name" type="text" placeholder="Nombre de tu criatura" maxlength="24" />
      <button id="btn-race" class="primary">Elegir sticker</button>
    </div>
  </section>

  <section id="screen-sticker" class="screen">
    <h1>Elegí tu sticker</h1>
    <p class="subtitle">Un curso, un pequeño superpoder para tu criatura.</p>
    <fieldset class="sticker-grid">
      <legend>Elegí uno o corré sin sticker</legend>
      <label class="sticker-option"><input type="radio" name="sticker" value="" checked />
        <strong>Sin sticker</strong><small>A tu propio ritmo</small><span>Sin bonus de juego</span></label>
      ${STICKERS.map(s => `<label class="sticker-option"><input type="radio" name="sticker" value="${s.code}" />
        ${stickerVisual(s.code)}<small>${stickerName(s.code)}</small><span>${s.description}</span></label>`).join('')}
    </fieldset>
    <div class="toolbar"><button id="btn-sticker-back">Volver</button>
      <button id="btn-sticker-go" class="primary">${joinMode ? 'Sumarme a la carrera' : 'A correr 🏁'}</button></div>
  </section>

  <section id="screen-race" class="screen">
    <div class="hud">
      <div><span class="label">Corredor</span><span id="hud-name">—</span></div>
      <div><span class="label">Tiempo</span><span id="hud-time">0.0s</span></div>
    </div>
    <canvas id="race-canvas" width="900" height="460"></canvas>
    <button id="cheer-btn" class="primary">¡Dale!</button>
    <p class="hint">Tocá "¡Dale!" con ritmo (no lo mantengas presionado) — también podés
      presionar la barra espaciadora.</p>
  </section>

  <section id="screen-result" class="screen">
    <h1 id="result-title">🏁 ¡Meta!</h1>
    <div class="card" id="result-card">
      <img id="racer-photo-preview" style="display:none" />
      <video id="hidden-video" autoplay playsinline muted style="display:none;width:1px;height:1px;"></video>
      <div id="result-flag">${COURSE_NAME}</div>
      <div><strong id="result-name">—</strong> · <span id="result-time">0.0s</span></div>
      <p id="ai-caption">Generando comentario…</p>
      <button id="btn-photo" class="secondary">Tomarme una foto</button>
    </div>
    <div class="card">
      <h3 style="margin:0 0 8px;">🏆 Mejores tiempos de hoy</h3>
      <ol class="leaderboard" id="leaderboard"></ol>
    </div>
    <button id="btn-again" class="primary">Jugar de nuevo</button>
  </section>
`;

prepareStickerImages(app);

const screens = {
  intro: document.getElementById("screen-intro")!,
  draw: document.getElementById("screen-draw")!,
  name: document.getElementById("screen-name")!,
  sticker: document.getElementById("screen-sticker")!,
  race: document.getElementById("screen-race")!,
  result: document.getElementById("screen-result")!,
};

function show(screen: keyof typeof screens) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle("active", key === screen);
  }
}

const drawCanvas = document.getElementById("draw-canvas") as HTMLCanvasElement;
const pad = new DrawPad(drawCanvas);
const colorButtons = document.querySelectorAll<HTMLButtonElement>(".color-swatch");
for (const button of colorButtons) {
  button.addEventListener("click", () => {
    pad.setColor(button.dataset.color!);
    for (const swatch of colorButtons) {
      const selected = swatch === button;
      swatch.classList.toggle("active", selected);
      swatch.setAttribute("aria-pressed", String(selected));
    }
  });
}

let currentDraw: ReturnType<DrawPad["extract"]> | null = null;
let racerName = "";
let selectedSticker: StickerCode | null = null;

document.getElementById("btn-start")!.addEventListener("click", () => {
  pad.reset();
  show("draw");
});

document.getElementById("btn-clear")!.addEventListener("click", () => pad.reset());
document.getElementById("btn-borrow")!.addEventListener("click", () => pad.borrowSample());

document.getElementById("btn-done")!.addEventListener("click", () => {
  if (!pad.hasEnoughInk()) {
    alert("Dibujá un poco más, o tocá 'Prestame una'.");
    return;
  }
  currentDraw = pad.extract();
  show("name");
  (document.getElementById("input-name") as HTMLInputElement).focus();
});

let race: Race | null = null;

document.getElementById("btn-sticker-back")!.addEventListener("click", () => show("name"));
document.getElementById("btn-race")!.addEventListener("click", () => {
  if (!currentDraw) return;
  racerName = (document.getElementById("input-name") as HTMLInputElement).value.trim() || "Sin nombre";
  show("sticker");
});
document.getElementById("btn-sticker-go")!.addEventListener("click", async () => {
  if (!currentDraw) return;
  selectedSticker = stickerFor(document.querySelector<HTMLInputElement>('input[name="sticker"]:checked')?.value)?.code ?? null;
  if (joinMode) {
    const button = document.getElementById("btn-sticker-go") as HTMLButtonElement;
    button.disabled = true;
    try {
      const response = await fetch("/api/join", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: racerName, sticker: selectedSticker, strokes: currentDraw.strokes.map(({ points, color }) => ({ points, color })) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      show("name");
      screens.name.replaceChildren();
      const title = document.createElement("h1");
      title.textContent = "Ya sos parte de la carrera — mirá la pantalla grande";
      screens.name.append(title);
    } catch (error) {
      alert(error instanceof Error ? error.message : "No se pudo enviar. Revisá la conexión e intentá otra vez.");
      button.disabled = false;
    }
    return;
  }
  document.getElementById("hud-name")!.textContent = racerName;
  show("race");

  const raceCanvas = document.getElementById("race-canvas") as HTMLCanvasElement;
  race = new Race(raceCanvas, {
    onTick: (elapsedMs) => {
      document.getElementById("hud-time")!.textContent = `${(elapsedMs / 1000).toFixed(1)}s`;
    },
    onFinish: ({ timeMs, positions }) => {
      race?.stop();
      onRaceFinished(timeMs, positions);
    },
  });

  race.addPlayer(currentDraw, { text: COURSE_NAME, color: "#ff5a36" }, selectedSticker);

  const ghost = bestGhost();
  if (ghost) race.addGhost(ghost);

  // Ritmo de computadora: un tiempo objetivo plausible, ligeramente aleatorio por partida.
  const targetMs = 6200 + Math.random() * 2600;
  race.addComputer(targetMs);

  race.start();
});

const cheer = () => {
  if (screens.race.classList.contains("active")) race?.cheer();
};
document.getElementById("cheer-btn")!.addEventListener("pointerdown", cheer);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space" && screens.race.classList.contains("active")) {
    e.preventDefault();
    if (!e.repeat) cheer();
  }
});

let lastPlace = 1;

async function onRaceFinished(timeMs: number, positions: number[]) {
  const ghosts = leaderboardTop(50);
  lastPlace = 1 + ghosts.filter((g) => g.timeMs < timeMs).length;

  const run: GhostRun = { name: racerName, sticker: selectedSticker, timeMs, positions, createdAt: Date.now() };
  saveGhost(run);

  document.getElementById("result-name")!.textContent = racerName;
  const resultFlag = document.getElementById("result-flag")!;
  resultFlag.innerHTML = selectedSticker
    ? `${stickerVisual(selectedSticker)}<span>${stickerName(selectedSticker)}</span>`
    : 'VLA · Sin sticker';
  prepareStickerImages(resultFlag);
  document.getElementById("result-time")!.textContent = `${(timeMs / 1000).toFixed(2)}s`;
  document.getElementById("ai-caption")!.textContent = "Generando comentario…";
  const photoPreview = document.getElementById("racer-photo-preview") as HTMLImageElement;
  photoPreview.style.display = "none";

  renderLeaderboard();
  show("result");

  const caption = await generateCaption({ name: racerName, timeMs, place: lastPlace });
  document.getElementById("ai-caption")!.textContent = caption;
}

function renderLeaderboard() {
  const list = document.getElementById("leaderboard")!;
  list.innerHTML = "";
  for (const g of leaderboardTop(8)) {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = g.name;
    const time = document.createElement("span");
    time.textContent = `${(g.timeMs / 1000).toFixed(2)}s`;
    li.append(name, time);
    list.appendChild(li);
  }
}

document.getElementById("btn-photo")!.addEventListener("click", async () => {
  const video = document.getElementById("hidden-video") as HTMLVideoElement;
  const dataUrl = await snapSelfie(video);
  const img = document.getElementById("racer-photo-preview") as HTMLImageElement;
  if (dataUrl) {
    img.src = dataUrl;
    img.style.display = "block";
  } else {
    alert("No se pudo acceder a la cámara. Seguí sin foto, no pasa nada.");
  }
});

document.getElementById("btn-again")!.addEventListener("click", () => {
  currentDraw = null;
  pad.reset();
  show("intro");
});

void FINISH_X;

if (joinMode) {
  document.body.classList.add("event-mode");
  show("draw");
}
}
