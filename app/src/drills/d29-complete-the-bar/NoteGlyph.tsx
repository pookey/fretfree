import { valueOf } from './logic';

/**
 * A note value drawn as notation draws it, for the palette and the bar's
 * values: a hollow head for a whole or half, a stem on all but the whole, a
 * flag per halving below a quarter, a dot, and a rest's squiggle. Drawn in
 * `currentColor`, so it follows the theme.
 */
export function NoteGlyph({ code, className }: { code: string; className?: string }) {
  const { value, dots = 0, rest } = valueOf(code);
  if (rest) {
    // A quarter rest, the only one the given starts use; others are drawn the same.
    return (
      <svg className={className} viewBox="0 0 28 40" aria-hidden="true" focusable="false">
        <path
          d="M11 5 l7 9 l-6 7 l7 9 q-7 -3 -7 4 q-4 -6 2 -8 l-5 -6 l6 -7 z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const hollow = value <= 2;
  const stem = value >= 2;
  const flags = value >= 8 ? Math.log2(value) - 2 : 0;
  return (
    <svg className={className} viewBox="0 0 28 40" aria-hidden="true" focusable="false">
      <ellipse
        cx={11}
        cy={32}
        rx={6.5}
        ry={4.6}
        transform="rotate(-20 11 32)"
        fill={hollow ? 'none' : 'currentColor'}
        stroke="currentColor"
        strokeWidth={hollow ? 2.2 : 1}
      />
      {stem && <line x1={17} y1={31} x2={17} y2={4} stroke="currentColor" strokeWidth={2} />}
      {Array.from({ length: flags }, (_, i) => (
        <path
          key={i}
          d={`M17 ${4 + i * 7} q 2 6 8 9 q -4 -1 -8 -3`}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={1.4}
        />
      ))}
      {dots > 0 && <circle cx={23} cy={31} r={2.2} fill="currentColor" />}
    </svg>
  );
}
