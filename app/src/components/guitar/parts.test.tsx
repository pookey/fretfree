import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BRIDGE, TAILPIECE } from './footprint';
import { GuitarArt } from './GuitarArt';
import { neckStringX } from './Neck';
import { look } from './test/fixtures';
import {
  Bevel,
  BridgeBase,
  BridgeTop,
  Controls,
  Pickup,
  Rosette,
  Tailpiece,
  stringEnd,
  type Paints,
} from './parts';

const PAINTS: Paints = { metal: '#c8ccd2', colour: '#c8ccd2', plastic: '#141110' };

function svg(children: React.ReactNode) {
  return render(<svg>{children}</svg>).container.querySelector('svg')!;
}

describe('parts', () => {
  it('draws a wide single coil with one row of six poles', () => {
    const el = svg(<Pickup at={{ type: 'wide', x: 0, y: 500 }} paints={PAINTS} />);
    expect(el.querySelectorAll('rect[width="86"]')).toHaveLength(2);
    expect(new Set([...el.querySelectorAll('circle')].map((c) => c.getAttribute('cy')))).toEqual(
      new Set(['0']),
    );
    expect(el.querySelectorAll('circle')).toHaveLength(6);
  });

  it('draws a locking tremolo: plate, posts, six saddles and six fine tuners', () => {
    const at = { type: 'locking', x: 0, y: 648 } as const;
    const base = svg(<BridgeBase at={at} paints={PAINTS} />);
    expect(base.querySelectorAll('circle')).toHaveLength(2);
    const top = svg(<BridgeTop at={at} paints={PAINTS} />);
    expect(top.querySelectorAll('rect')).toHaveLength(6);
    expect(top.querySelectorAll('circle[r="3.6"]')).toHaveLength(6);
    // The strings clamp at the saddles, so they end just past them.
    expect(stringEnd(at)).toBe(659);
    expect(BRIDGE.locking.y1).toBeGreaterThan(40);
  });

  it('draws a vibrato tailpiece with its arm inside the footprint', () => {
    const el = svg(<Tailpiece at={{ type: 'vibrato', x: 0, y: 712 }} paints={PAINTS} />);
    const tip = [...el.querySelectorAll('circle')].at(-1)!;
    expect(Number(tip.getAttribute('cx')) + 3.5).toBeLessThanOrEqual(TAILPIECE.vibrato.x1);
    expect(Number(tip.getAttribute('cy')) + 3.5).toBeLessThanOrEqual(TAILPIECE.vibrato.y1);
    expect(el.querySelectorAll('circle[r="1.6"]')).toHaveLength(6);
  });

  it('draws an open trapeze with a hole for each string', () => {
    const el = svg(<Tailpiece at={{ type: 'trapeze', x: 0, y: 688 }} paints={PAINTS} />);
    expect(el.querySelectorAll('circle[r="1.4"]')).toHaveLength(6);
  });

  it('draws a steel-string bridge: a wooden bar, a slanted bone saddle and six pins', () => {
    const at = { type: 'acoustic', x: 0, y: 648 } as const;
    const base = svg(<BridgeBase at={at} paints={PAINTS} />);
    expect(base.querySelector('path[fill="#2b1d16"]')).not.toBeNull();
    const top = svg(<BridgeTop at={at} paints={PAINTS} neck="acoustic" />);
    expect(top.querySelector('g[transform="rotate(-2.5)"]')).not.toBeNull();
    const pins = [...top.querySelectorAll('circle[r="3.1"]')];
    expect(pins).toHaveLength(6);
    // Each pin sits under its string, where the strings end.
    expect(Number(pins[5]!.getAttribute('cx'))).toBeCloseTo(neckStringX('acoustic', 6, 658));
    expect(stringEnd(at)).toBe(658);
    // No metal on a wooden bridge.
    expect(top.innerHTML).not.toContain(PAINTS.metal);
  });

  it('draws a tie-block bridge with each string tied off on the block', () => {
    const at = { type: 'tie-block', x: 0, y: 648 } as const;
    const base = svg(<BridgeBase at={at} paints={PAINTS} />);
    // The block behind the saddle, with its mosaic strip.
    expect(base.querySelectorAll('rect').length).toBeGreaterThanOrEqual(3);
    expect(base.querySelector('path[stroke-dasharray]')).not.toBeNull();
    const top = svg(<BridgeTop at={at} paints={PAINTS} neck="classical" />);
    const knots = [...top.querySelectorAll('path')];
    expect(knots).toHaveLength(6);
    expect(knots.slice(0, 3).map((k) => k.getAttribute('stroke'))).toEqual(
      Array(3).fill('#ece2c8'),
    );
    expect(stringEnd(at)).toBe(657);
    expect(BRIDGE['tie-block'].x1).toBeGreaterThan(BRIDGE.acoustic.x1);
  });

  it('draws a rosette as inlaid rings and a mosaic, centred on its path', () => {
    const el = svg(<Rosette d="M 0 0 L 10 0" width={8} />);
    const widths = [...el.querySelectorAll('path')].map(
      (p) => Math.round(Number(p.getAttribute('stroke-width')) * 10) / 10,
    );
    expect(widths).toEqual([8, 5.6, 3.6, 1.2]);
    expect(el.querySelectorAll('path[stroke-dasharray]')).toHaveLength(1);
  });

  it('draws roller wheels at their angle', () => {
    const el = svg(
      <Controls
        at={{
          knobs: [],
          rollers: [
            { x: -100, y: 350, angle: 12 },
            { x: -96, y: 370, angle: 12 },
          ],
        }}
        paints={PAINTS}
      />,
    );
    const rollers = el.querySelectorAll('g[transform$="rotate(12)"]');
    expect(rollers).toHaveLength(2);
  });

  it('draws a bevel as clipped strokes, its edge line masked to the band', () => {
    const el = svg(<Bevel d="M 0 0 L 100 0 L 100 100 Z" width={13} clip="url(#body)" id="b1" />);
    expect(el.querySelector('g')).toHaveAttribute('clip-path', 'url(#body)');
    const mask = el.querySelector('mask#b1')!;
    expect([...mask.querySelectorAll('path')].map((p) => p.getAttribute('stroke-width'))).toEqual([
      '27.6',
      '26',
    ]);
    expect(el.querySelector('path[mask="url(#b1)"]')).not.toBeNull();
    // Lit towards the upper left, shaded towards the lower right: not an even halo.
    const grad = el.querySelector('linearGradient#b1-light')!;
    // A true 45° in millimetres, not the stretched diagonal of a tall body's box.
    expect(grad).toHaveAttribute('gradientUnits', 'userSpaceOnUse');
    const dx = Number(grad.getAttribute('x2')) - Number(grad.getAttribute('x1'));
    const dy = Number(grad.getAttribute('y2')) - Number(grad.getAttribute('y1'));
    expect(dx).toBe(dy);
    const stops = [...el.querySelectorAll('linearGradient#b1-light stop')];
    expect(stops[0]).toHaveAttribute('stop-color', '#fff');
    expect(stops.at(-1)).toHaveAttribute('stop-color', '#000');
    expect(el.querySelector('path[stroke="url(#b1-light)"]')).toHaveAttribute('stroke-width', '26');
  });

  it("gives each guitar's bevel its own mask", () => {
    const sg = look({ body: { name: 'SG', render: { shape: 'sg' } } });
    render(
      <>
        <GuitarArt spec={sg} size={20} />
        <GuitarArt spec={sg} size={20} />
      </>,
    );
    const masks = [...document.querySelectorAll('mask')].map((m) => m.id);
    expect(masks).toHaveLength(2);
    expect(new Set(masks).size).toBe(2);
  });
});
