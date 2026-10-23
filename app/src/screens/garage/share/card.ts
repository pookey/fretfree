import { FULL_FRAME } from '../../../components/guitar/frame';
import { ACHIEVEMENTS } from '../../../engine/gamification/achievements';

/**
 * The "share my guitar" card (design §3.8 sharing): a portrait PNG drawn on
 * the device, with the guitar on the left and its name, an optional badges
 * line and the app's address on the right. This module is the layout and
 * the drawing; `render.tsx` supplies the guitar image and the canvas.
 */

export const CARD = { width: 1080, height: 1350 } as const;

const PAD = 80;
/** The guitar, as tall as the card allows, at the drawing's aspect. */
const GUITAR_HEIGHT = CARD.height - 2 * PAD;
export const GUITAR_BOX = {
  x: PAD,
  y: PAD,
  width: Math.round((GUITAR_HEIGHT * FULL_FRAME.width) / FULL_FRAME.height),
  height: GUITAR_HEIGHT,
} as const;
/** The text column beside the guitar. */
const TEXT_X = GUITAR_BOX.x + GUITAR_BOX.width + 72;
const TEXT_WIDTH = CARD.width - PAD - TEXT_X;

/** The card's colours: FretFree's dark theme, whatever the page's theme. */
const COLOURS = {
  top: '#261f35',
  // The page background, not the sunken shade: a black body needs a wall to stand on.
  bottom: '#1b1626',
  light: 'rgba(255, 244, 220, 0.26)',
  text: '#f7f2ff',
  muted: '#b4aaca',
  brand: '#f5c542',
} as const;

const FONT = "'Clear Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
/** The name's sizes, largest first: a long name steps down before it is cut short. */
const NAME = { sizes: [68, 58, 50], lines: 4 } as const;
const MODEL = { size: 36, line: 48, lines: 2 } as const;
const BADGES = { size: 32, line: 44, lines: 6 } as const;
const font = (weight: 400 | 700, size: number) => `${weight} ${size}px ${FONT}`;
/** The faces the card draws in, to load before drawing. */
export const CARD_FONTS = [font(700, NAME.sizes[0]), font(400, BADGES.size)];

export interface CardText {
  name: string;
  /** The body and finish, e.g. "Stratocaster · Red". */
  model: string;
  /** Badge titles to list, or none for no badges line. */
  badges: readonly string[];
  /** Where the app lives, shown without its scheme (`fretfree.app`). */
  url: string;
}

/** What `drawCard` needs from a 2D canvas context. */
export type CardContext = Pick<
  CanvasRenderingContext2D,
  | 'fillStyle'
  | 'font'
  | 'textBaseline'
  | 'fillRect'
  | 'fillText'
  | 'measureText'
  | 'drawImage'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'save'
  | 'restore'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetY'
>;

type Measure = (text: string) => number;

/**
 * Break `text` into at most `maxLines` lines no wider than `maxWidth`,
 * breaking at spaces (or inside a word too long for a line). Overflow ends
 * the last line with an ellipsis; `truncated` says it happened.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: Measure,
  maxLines: number,
): { lines: string[]; truncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const joined = line ? `${line} ${word}` : word;
    if (measure(joined) <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    // A word wider than a line breaks wherever it must.
    while (measure(line) > maxWidth && line.length > 1) {
      let cut = line.length - 1;
      while (cut > 1 && measure(line.slice(0, cut)) > maxWidth) cut--;
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return { lines, truncated: false };

  const kept = lines.slice(0, maxLines);
  let last = `${kept[maxLines - 1] ?? ''}…`;
  while (measure(last) > maxWidth && last.length > 1) last = `${last.slice(0, -2)}…`;
  kept[maxLines - 1] = last;
  return { lines: kept, truncated: true };
}

/**
 * "Badges: Whole neck, Speed demon", wrapped to the column. When they don't
 * all fit, as many as do, then "and N more". No badges, no line.
 */
export function badgeLines(
  titles: readonly string[],
  maxWidth: number,
  measure: Measure,
  maxLines: number,
): string[] {
  let lines: string[] = [];
  for (let shown = titles.length; shown > 0; shown--) {
    const rest = titles.length - shown;
    const text = `Badges: ${titles.slice(0, shown).join(', ')}${rest > 0 ? ` and ${rest} more` : ''}`;
    const wrapped = wrapText(text, maxWidth, measure, maxLines);
    lines = wrapped.lines;
    if (!wrapped.truncated) break;
  }
  return lines;
}

/** The earned badges' titles, in the badge shelf's order. */
export function earnedBadgeTitles(achievements: readonly { id: string }[]): string[] {
  const earned = new Set(achievements.map((a) => a.id));
  return ACHIEVEMENTS.filter((a) => earned.has(a.id)).map((a) => a.title);
}

/** The app's address as people would type it: host and path, no scheme. */
export function displayUrl(href: string): string {
  const url = new URL(href);
  return `${url.host}${url.pathname.replace(/\/$/, '')}`;
}

/** The PNG's file name: `fretfree-<guitar name>.png`, cut short between words. */
export function cardFileName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  // Up to 40 characters, ending at a word break when there is one.
  const head = slug.slice(0, 41);
  const lastBreak = head.lastIndexOf('-');
  const cut =
    slug.length <= 40 ? slug : lastBreak > 0 ? head.slice(0, lastBreak) : head.slice(0, 40);
  return `fretfree-${cut || 'guitar'}.png`;
}

/**
 * The guitar's name at the largest size that fits the column in four lines,
 * or cut short at the smallest. `measureAt` sets the size and measures in it.
 */
export function nameLines(
  name: string,
  measureAt: (size: number) => Measure,
): { size: number; lines: string[] } {
  let fit = { size: 0, lines: [] as string[] };
  for (const size of NAME.sizes) {
    const wrapped = wrapText(name, TEXT_WIDTH, measureAt(size), NAME.lines);
    fit = { size, lines: wrapped.lines };
    if (!wrapped.truncated) break;
  }
  return fit;
}

/** Draw the whole card: background, guitar, then the text column. */
export function drawCard(ctx: CardContext, guitar: CanvasImageSource, text: CardText): void {
  const bg = ctx.createLinearGradient(0, 0, 0, CARD.height);
  bg.addColorStop(0, COLOURS.top);
  bg.addColorStop(1, COLOURS.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  // A warm spotlight on the body, where a dark finish needs it most, wide
  // enough to reach the headstock.
  const cx = GUITAR_BOX.x + GUITAR_BOX.width / 2;
  const cy = GUITAR_BOX.y + GUITAR_BOX.height * 0.68;
  const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, GUITAR_BOX.height * 0.7);
  spot.addColorStop(0, COLOURS.light);
  spot.addColorStop(1, 'rgba(255, 244, 220, 0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  // Lifted off the wall, as on the Garage stage, but lightly: a deep shadow
  // would swallow the edge of a black body.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 16;
  ctx.drawImage(guitar, GUITAR_BOX.x, GUITAR_BOX.y, GUITAR_BOX.width, GUITAR_BOX.height);
  ctx.restore();

  const measure: Measure = (s) => ctx.measureText(s).width;
  ctx.textBaseline = 'alphabetic';
  let y = PAD + 180;

  ctx.fillStyle = COLOURS.text;
  const name = nameLines(text.name, (size) => {
    ctx.font = font(700, size);
    return measure;
  });
  for (const line of name.lines) {
    ctx.fillText(line, TEXT_X, y);
    y += Math.round(name.size * 1.18);
  }

  ctx.font = font(400, MODEL.size);
  ctx.fillStyle = COLOURS.muted;
  y += 8;
  for (const line of wrapText(text.model, TEXT_WIDTH, measure, MODEL.lines).lines) {
    ctx.fillText(line, TEXT_X, y);
    y += MODEL.line;
  }

  ctx.font = font(400, BADGES.size);
  y += 40;
  for (const line of badgeLines(text.badges, TEXT_WIDTH, measure, BADGES.lines)) {
    ctx.fillText(line, TEXT_X, y);
    y += BADGES.line;
  }

  // The footer: who made it, and where to find the app.
  const footer = CARD.height - PAD - 20;
  ctx.font = font(700, 48);
  ctx.fillStyle = COLOURS.brand;
  ctx.fillText('FretFree', TEXT_X, footer - 56);
  ctx.font = font(400, BADGES.size);
  ctx.fillStyle = COLOURS.muted;
  for (const line of wrapText(text.url, TEXT_WIDTH, measure, 1).lines) {
    ctx.fillText(line, TEXT_X, footer);
  }
}
