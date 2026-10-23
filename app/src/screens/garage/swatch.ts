import { darken, lighten } from '../../components/guitar/colour';
import type { ColourStop, RenderData } from '../../engine/garage';

/**
 * CSS paints for the picker's swatches: a finish or a metal as a small chip,
 * close to how the guitar renderer draws it (`components/guitar/finish.tsx`).
 */

const FALLBACK = '#8a8a8a';

function stopList(stops: readonly ColourStop[]): string {
  return stops.map((s) => `${s.colour} ${Math.round(s.offset * 100)}%`).join(', ');
}

/** One colour as a light-to-dark sweep, when a finish gives just one. */
function shaded(colour: string): string {
  return `${lighten(colour, 0.18)} 0%, ${colour} 55%, ${darken(colour, 0.22)} 100%`;
}

/** The CSS `background` of a finish swatch. */
export function finishBackground({ type, stops: given }: RenderData['finish']): string {
  const stops = [...given].sort((a, b) => a.offset - b.offset);
  const base = stops[0]?.colour ?? FALLBACK;
  const list = stops.length >= 2 ? stopList(stops) : shaded(base);
  switch (type) {
    case 'sunburst':
      return `radial-gradient(circle at 50% 55%, ${list})`;
    case 'natural':
      return (
        'repeating-linear-gradient(100deg, rgb(0 0 0 / 0) 0 5px, rgb(0 0 0 / 0.12) 5px 6px), ' +
        `linear-gradient(160deg, ${list})`
      );
    case 'metallic':
      return `linear-gradient(135deg, ${list})`;
    case 'sparkle': {
      const flake = stops[stops.length - 1]?.colour ?? '#ffffff';
      return (
        `radial-gradient(circle, ${flake} 0 1px, rgb(0 0 0 / 0) 1.6px) 0 0 / 7px 7px, ` +
        `radial-gradient(circle, ${flake} 0 0.8px, rgb(0 0 0 / 0) 1.3px) 3px 4px / 9px 9px, ` +
        `linear-gradient(135deg, ${lighten(base, 0.15)}, ${darken(base, 0.25)})`
      );
    }
    case 'solid':
      return `linear-gradient(160deg, ${shaded(base)})`;
  }
}

/** The CSS `background` of a hardware swatch: the metal with a highlight. */
export function metalBackground(colour: string): string {
  return (
    `linear-gradient(135deg, ${lighten(colour, 0.55)} 0%, ${colour} 45%, ` +
    `${darken(colour, 0.3)} 80%, ${lighten(colour, 0.2)} 100%)`
  );
}
