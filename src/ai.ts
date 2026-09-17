// La carrera y el registro nunca dependen de esto: esta función siempre resuelve rápido,
// con o sin red, porque en un evento presencial el WiFi del venue no es confiable.

export interface CaptionInput {
  name: string;
  timeMs: number;
  place: number;
}

const TEMPLATES = [
  (n: string, t: string) => `${n} cruzó la meta en ${t}s con una técnica que ningún manual de biomecánica reconocería.`,
  (n: string, t: string) => `Los jueces todavía discuten si lo de ${n} fue correr o una forma nueva de caer hacia adelante. Tiempo: ${t}s.`,
  (n: string, t: string) => `${n} entrenó toda su vida para este momento. Se nota. Tiempo oficial: ${t}s.`,
  (n: string, t: string) => `Científicos confirman: la criatura de ${n} desafía tres leyes de la física y una del sentido común. ${t}s.`,
  (n: string, t: string) => `${n} no ganó la carrera, pero ganó nuestro respeto. ${t}s de pura determinación.`,
];

function localCaption({ name, timeMs }: CaptionInput): string {
  const t = (timeMs / 1000).toFixed(2);
  const n = name?.trim() || "Anónimo";
  const pick = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return pick(n, t);
}

// Endpoint opcional: se deja sin configurar hasta que exista un proxy serverless que
// guarde la key del proveedor de IA del lado del servidor (nunca en el cliente).
const REMOTE_ENDPOINT: string | null = null;
const REMOTE_TIMEOUT_MS = 2500;

async function remoteCaption(input: CaptionInput): Promise<string> {
  if (!REMOTE_ENDPOINT) throw new Error("no remote endpoint configured");
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS);
  try {
    const res = await fetch(REMOTE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    if (typeof data.caption !== "string") throw new Error("bad shape");
    return data.caption;
  } finally {
    clearTimeout(t);
  }
}

export async function generateCaption(input: CaptionInput): Promise<string> {
  if (!REMOTE_ENDPOINT) return localCaption(input);
  try {
    return await remoteCaption(input);
  } catch {
    return localCaption(input);
  }
}
