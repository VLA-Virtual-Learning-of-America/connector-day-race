import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { createRoom, MAX_RACERS } from './room.js';
import { fileURLToPath } from 'node:url';

const AUTO_START = Number(process.env.AUTO_START ?? 4); // 0 = solo manual
const PORT = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(AUTO_START) || AUTO_START < 0 || AUTO_START > MAX_RACERS) {
  throw new Error('AUTO_START debe ser 0–6');
}
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const addresses = () => Object.values(networkInterfaces()).flat()
  .filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
// Railway (y cualquier PaaS con dominio público) expone la app detrás de un proxy con
// otro puerto/host: las IPs de red local del contenedor no sirven para que un celular
// se conecte desde afuera. Si hay un dominio público configurado, es la única URL real.
const PUBLIC_URL = process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null;
const joinUrls = () => PUBLIC_URL
  ? [`${PUBLIC_URL}/?join=1`]
  : addresses().map(ip => `http://${ip}:${PORT}/?join=1`);
function broadcast(message) {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
  }
}
const room = createRoom(AUTO_START, broadcast);

app.use(express.json({ limit: '1mb' }));
app.get('/api/info', (_req, res) => res.json({ joinUrls: joinUrls() }));
app.post('/api/join', (req, res) => {
  const result = room.join(req.body ?? {});
  res.status(result.status).json(result.error ? { error: result.error } : { id: result.id });
});
app.post('/api/start', (_req, res) => {
  if (!room.start()) return res.status(409).json({ error: 'La sala está vacía o la carrera ya empezó.' });
  res.json({ ok: true });
});
app.post('/api/reset', (_req, res) => {
  room.reset();
  res.json({ ok: true });
});
wss.on('connection', client => {
  client.on('error', console.error);
  client.send(JSON.stringify(room.state()));
});
const staticRoot = fileURLToPath(new URL('../dist/', import.meta.url));
// The same build keeps its GitHub Pages base and is also served locally at /.
app.use('/connector-day-race', express.static(staticRoot));
app.use(express.static(staticRoot));
app.use((error, _req, res, _next) => {
  res.status(error.status ?? 500).json({ error: 'No se pudo procesar el envío.' });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Anfitrión: ${PUBLIC_URL ?? `http://localhost:${PORT}`}/?host=1`);
  for (const url of joinUrls()) console.log(`Celulares: ${url}`);
  console.log(PUBLIC_URL
    ? `Dominio público de Railway. Máximo ${MAX_RACERS}; arranque automático: ${AUTO_START || 'desactivado'}.`
    : `Misma red local. Máximo ${MAX_RACERS}; arranque automático: ${AUTO_START || 'desactivado'}.`);
});
