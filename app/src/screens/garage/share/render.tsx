import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { loadGuitarArt, type GuitarLook } from '../../../components/guitar';
import { CARD, CARD_FONTS, GUITAR_BOX, drawCard, type CardText } from './card';

/**
 * The guitar as a standalone SVG document, `width` × `height` pixels. Every
 * paint is an SVG attribute, so it draws the same as an image as on the page.
 * Rendered off-screen, from the chunk the Garage's preview already loaded.
 */
export async function guitarSvg(look: GuitarLook, width: number, height: number): Promise<string> {
  const { GuitarArt } = await loadGuitarArt();
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    flushSync(() => root.render(<GuitarArt spec={look} size={1} />));
    const svg = host.querySelector('svg');
    if (!svg) throw new Error('The guitar drew no SVG');
    svg.removeAttribute('style');
    svg.removeAttribute('role');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    // The serializer writes the SVG namespace on the root itself.
    return new XMLSerializer().serializeToString(svg);
  } finally {
    root.unmount();
  }
}

/** Decode an SVG document into an image, from a data URL: nothing is fetched. */
async function svgImage(markup: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await img.decode();
  return img;
}

/** Make sure the card's typeface is ready, so the text doesn't draw in a fallback. */
async function fontsReady(): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await Promise.all(CARD_FONTS.map((f) => document.fonts.load(f)));
  } catch {
    // The system font will do.
  }
}

/** The share card as a PNG, made entirely on this device. */
export async function renderCard(look: GuitarLook, text: CardText): Promise<Blob> {
  // Twice the drawn size, so the guitar stays crisp when the canvas scales it.
  const [markup] = await Promise.all([
    guitarSvg(look, GUITAR_BOX.width * 2, GUITAR_BOX.height * 2),
    fontsReady(),
  ]);
  const guitar = await svgImage(markup);
  const canvas = document.createElement('canvas');
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas');
  drawCard(ctx, guitar, text);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The card could not be encoded'))),
      'image/png',
    ),
  );
}
