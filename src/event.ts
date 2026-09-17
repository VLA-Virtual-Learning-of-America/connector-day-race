import { restoreDrawing, type Stroke } from './draw';
import { Race, type StickerCode } from './race';

interface Entrant { id: string; name: string; strokes: Stroke[]; sticker?: StickerCode | null }
interface Lobby { type: 'lobby' | 'start'; racers: Entrant[]; started?: boolean; max?: number; autoStart?: number }

export async function mountHost() {
  document.body.classList.add('event-mode', 'host-mode');
  const app = document.querySelector<HTMLDivElement>('#app')!;
  app.innerHTML = `<section class="screen active">
    <h1>La carrera de tus criaturas</h1>
    <p id="event-status" role="status">Conectando con la sala…</p>
    <div id="lobby">
      <div class="join-instructions"><strong class="room-code">SALA 1</strong>
        <img id="join-qr" alt="Código QR para unirse" hidden />
        <div><p id="join-instructions-text">Escaneá o entrá al link y dibujá tu corredor</p>
        <select id="join-network" aria-label="Dirección de la red local" hidden></select>
        <p><a id="join-link"></a></p></div></div>
      <ul id="entrants"></ul>
      <button id="start-now" class="primary" disabled>Empezar ya</button>
    </div>
    <canvas id="event-race" width="1280" height="720" hidden></canvas>
    <ol id="event-results" hidden></ol>
    <button id="new-round" hidden>Nueva ronda</button>
  </section>`;
  const status = document.getElementById('event-status')!;
  const lobby = document.getElementById('lobby')!;
  const canvas = document.getElementById('event-race') as HTMLCanvasElement;
  const results = document.getElementById('event-results')!;
  const start = document.getElementById('start-now') as HTMLButtonElement;
  const reset = document.getElementById('new-round') as HTMLButtonElement;
  let race: Race | undefined;
  let racing = false;
  let socket: WebSocket;
  let reconnect: ReturnType<typeof setTimeout>;
  let disposed = false;

  async function post(path: string) {
    const res = await fetch(path, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
  }
  start.onclick = async () => {
    start.disabled = true;
    try { await post('/api/start'); }
    catch (e) { status.textContent = String(e); start.disabled = false; }
  };
  reset.onclick = async () => {
    reset.disabled = true;
    try { await post('/api/reset'); }
    catch (e) { status.textContent = String(e); }
    finally { reset.disabled = false; }
  };
  function receive(message: Lobby) {
    if (message.type === 'start') {
      if (racing) return;
      racing = true;
      lobby.hidden = true;
      reset.hidden = true;
      results.hidden = true;
      canvas.hidden = false;
      race = new Race(canvas, {
        onTick: ms => { status.textContent = `¡Vamos! ${(ms / 1000).toFixed(1)} s`; },
        onFinish: () => {},
        onAllFinish: standings => {
          racing = false;
          status.textContent = '¡Terminó la carrera!';
          results.replaceChildren();
          for (const r of standings) {
            const li = document.createElement('li');
            li.textContent = `${r.name} — ${r.timeMs === undefined ? 'No llegó · ' + Math.max(0, Math.round(r.distance)) + ' recorridos' : (r.timeMs / 1000).toFixed(2) + ' s'}`;
            results.append(li);
          }
          canvas.hidden = true;
          results.hidden = false;
          reset.hidden = false;
        },
      });
      for (const entrant of message.racers) race.addEntrant(restoreDrawing(entrant.strokes), entrant.name, entrant.sticker);
      race.start();
      return;
    }
    if (message.started) {
      if (!racing && results.hidden) {
        status.textContent = 'La ronda ya empezó. Creá una nueva ronda para volver a inscribirse.';
        start.disabled = true;
        reset.hidden = false;
      }
      return;
    }
    race?.stop();
    racing = false;
    lobby.hidden = false;
    canvas.hidden = true;
    results.hidden = true;
    reset.hidden = true;
    status.textContent = `${message.racers.length}/${message.max} corredores · ${message.autoStart ? 'Arranque automático a los ' + message.autoStart : 'Arranque manual'}`;
    start.disabled = !message.racers.length;
    const list = document.getElementById('entrants')!;
    list.replaceChildren();
    for (const entrant of message.racers) {
      const item = document.createElement('li');
      const thumbnail = restoreDrawing(entrant.strokes).sprite;
      thumbnail.setAttribute('aria-label', `Dibujo de ${entrant.name}`);
      const name = document.createElement('span');
      name.textContent = entrant.name + (entrant.sticker ? ` · ${entrant.sticker}` : '');
      item.append(thumbnail, name);
      list.append(item);
    }
  }
  function connect() {
    socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
    socket.onmessage = event => {
      try { receive(JSON.parse(event.data)); }
      catch (e) { race?.stop(); racing = false; status.textContent = `No se pudo cargar la ronda: ${e}`; reset.hidden = false; }
    };
    socket.onclose = () => {
      if (disposed) return;
      start.disabled = true;
      if (!racing) status.textContent = 'Sin conexión al servidor. Reconectando…';
      reconnect = setTimeout(connect, 2000);
    };
  }
  connect();
  window.addEventListener('pagehide', () => {
    disposed = true;
    clearTimeout(reconnect);
    race?.stop();
    socket.close();
  }, { once: true });
  try {
    const response = await fetch('/api/info');
    if (!response.ok) throw new Error('No se pudo obtener la IP local');
    const { joinUrls } = await response.json() as { joinUrls: string[] };
    const select = document.getElementById('join-network') as HTMLSelectElement;
    const urls = joinUrls.length ? joinUrls : [`${location.origin}/?join=1`];
    for (const url of urls) select.add(new Option(url, url));
    const current = urls.find(url => new URL(url).hostname === location.hostname);
    if (current) select.value = current;
    // Con un solo link (dominio público, o un solo adaptador de red) no hay nada que elegir.
    select.hidden = urls.length <= 1;
    const isPublicUrl = new URL(select.value || urls[0]).protocol === 'https:';
    document.getElementById('join-instructions-text')!.textContent = isPublicUrl
      ? 'Escaneá o entrá al link (funciona desde cualquier red) y dibujá tu corredor'
      : 'Conectate a la misma WiFi, escaneá o entrá al link y dibujá tu corredor';
    async function updateLink() {
      const link = document.getElementById('join-link') as HTMLAnchorElement;
      link.href = select.value;
      link.textContent = select.value;
      // QR generado del lado del servidor (api.qrserver.com, gratis, sin dependencias nuevas
      // del lado del cliente): si el venue no tiene salida a ese servicio, el link de texto
      // de abajo sigue funcionando igual.
      const qr = document.getElementById('join-qr') as HTMLImageElement;
      qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(select.value)}`;
      qr.hidden = false;
    }
    select.onchange = () => { void updateLink(); };
    await updateLink();
  } catch {
    status.textContent = 'Abrí este modo desde el servidor local Node. No funciona en GitHub Pages.';
  }
}
