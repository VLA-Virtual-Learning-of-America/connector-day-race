import { stickerFor, type StickerCode } from './race';

// Static local files: no third-party requests while playing. Race flags keep short codes.
const visuals: Record<StickerCode, { file?: string; alt: string; name?: string }> = {
  CCNA: { file: 'CCNA.svg', alt: 'Cisco' },
  AWS: { file: 'AWS.svg', alt: 'Amazon Web Services' },
  PMP: { alt: 'PMP', name: 'Project Management Professional (PMP)' },
  MKT: { file: 'MKT.svg', alt: 'Megáfono: marketing (ícono genérico)' },
  AIB: { file: 'AIB.svg', alt: 'Inteligencia artificial (ícono genérico)' },
  ACM: { file: 'ACM.svg', alt: 'Creación de contenido (ícono genérico)' },
  CYB: { file: 'CYB.svg', alt: 'CompTIA', name: 'Ciberseguridad · CompTIA Security+' },
  SIX: { file: 'SIX.svg', alt: 'Sigma (símbolo genérico)' },
};

export function stickerName(code: StickerCode) {
  return visuals[code].name ?? stickerFor(code)!.name;
}

export function stickerVisual(code: StickerCode) {
  const visual = visuals[code];
  return `<span class="sticker-visual"><strong>${code}</strong>${visual.file
    ? `<img src="${import.meta.env.BASE_URL}stickers/${visual.file}" alt="${visual.alt}" />`
    : ''}</span>`;
}

// The short code remains visible if a local asset fails to load.
export function prepareStickerImages(root: HTMLElement) {
  root.querySelectorAll<HTMLImageElement>('.sticker-visual img').forEach(img => {
    const update = () => img.parentElement!.classList.toggle('has-logo', img.naturalWidth > 0);
    img.addEventListener('load', update);
    img.addEventListener('error', update);
    if (img.complete) update();
  });
}
