import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { contrast } from './colour';
import { GuitarArt } from './GuitarArt';
import { BODIES } from './registry';
import { FINISHES, look } from './test/fixtures';
import type { FinishType } from './types';

const BLACK = {
  name: 'Black',
  render: { type: 'solid', stops: [{ offset: 0, colour: '#161616' }] },
} as const;

const PAINT: Record<FinishType, string | null> = {
  solid: null,
  sunburst: 'radialGradient',
  natural: 'pattern',
  metallic: 'linearGradient',
  sparkle: 'pattern',
};

function finishFill(svg: Element, type: FinishType): Element | null {
  const tag = PAINT[type];
  return tag ? svg.querySelector(`${tag}[id$="-finish"]`) : null;
}

describe('<GuitarArt>', () => {
  const shapes = [...BODIES.keys()];
  const types = Object.keys(FINISHES) as FinishType[];

  describe.each(shapes)('%s', (shape) => {
    it.each(types)('renders a %s finish', (type) => {
      const finish = FINISHES[type];
      render(
        <GuitarArt
          spec={look({ body: { name: BODIES.get(shape)!.name, render: { shape } }, finish })}
          size={20}
        />,
      );
      const svg = screen.getByRole('img');
      expect(svg.tagName).toBe('svg');
      const name = BODIES.get(shape)!.name.replace(/[()]/g, '\\$&');
      expect(svg).toHaveAccessibleName(new RegExp(`^${name} guitar, `));
      const d = BODIES.get(shape)!.outline;
      // Matched in JS: a selector on a long path string is unreliable in jsdom.
      const outline = [...svg.querySelectorAll('path')].filter((p) => p.getAttribute('d') === d);
      expect(outline.length).toBeGreaterThan(2);
      const paint = finishFill(svg, type);
      if (type === 'solid') {
        expect([...outline].map((p) => p.getAttribute('fill'))).toContain('#b3262d');
      } else {
        expect(paint).not.toBeNull();
        const url = `url(#${paint!.id})`;
        expect([...outline].map((p) => p.getAttribute('fill'))).toContain(url);
      }
      // A static drawing: nothing animates, with or without reduced motion.
      expect(svg.querySelector('animate, animateTransform, animateMotion, set')).toBeNull();
      expect(svg.innerHTML).not.toMatch(/animation|transition/);
    });
  });

  it('draws the pickguard only when the spec has one', () => {
    const { rerender } = render(<GuitarArt spec={look()} size={20} />);
    expect(document.querySelectorAll('path[fill="#efe3c8"]').length).toBeGreaterThan(0);
    rerender(
      <GuitarArt
        spec={look({ pickguard: { name: 'None', render: { colour: null } } })}
        size={20}
      />,
    );
    expect(document.querySelectorAll('path[fill="#efe3c8"]')).toHaveLength(0);
  });

  it.each([
    ['a black guard', { name: 'Black', render: { colour: '#1b1b1b' } }, FINISHES.solid],
    ['no guard on a black finish', { name: 'None', render: { colour: null } }, BLACK],
  ] as const)('keeps single-coil covers visible on %s', (_, pickguard, finish) => {
    const surface = pickguard.render.colour ?? finish.render.stops[0]!.colour;
    render(
      <GuitarArt
        spec={look({
          body: { name: 'Stratocaster', render: { shape: 'stratocaster' } },
          pickguard,
          finish,
        })}
        size={20}
      />,
    );
    // The cover is the 72 x 18 rounded rect of each single coil.
    const covers = [...screen.getByRole('img').querySelectorAll('rect[width="72"]')];
    expect(covers).toHaveLength(3);
    for (const c of covers) {
      expect(contrast(c.getAttribute('fill')!, surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('names no pickguard on a body that draws none, though the spec has one', () => {
    render(
      <GuitarArt
        spec={look({ body: { name: 'Superstrat', render: { shape: 'superstrat' } } })}
        size={20}
      />,
    );
    const svg = screen.getByRole('img');
    expect(svg).toHaveAccessibleName(/^Superstrat guitar, cherry sunburst, no pickguard, /);
    expect(svg.querySelectorAll('path[fill="#efe3c8"]')).toHaveLength(0);
  });

  it('draws a classical with its slotted head, nylon trebles, tie block and no guard', () => {
    render(
      <GuitarArt
        spec={look({ body: { name: 'Classical', render: { shape: 'classical' } } })}
        size={20}
      />,
    );
    const svg = screen.getByRole('img');
    expect(svg).toHaveAccessibleName(/^Classical guitar, cherry sunburst, no pickguard, /);
    expect(svg.querySelectorAll('path[fill="#efe3c8"]')).toHaveLength(0);
    // Two slots, and rollers across them.
    expect(svg.querySelectorAll('path[fill="#140f0c"]')).toHaveLength(2);
    expect(svg.querySelectorAll('rect[fill="#e9e0cf"]')).toHaveLength(6);
    const strings = [...svg.querySelectorAll('g[data-string]')].map((g) =>
      g.querySelectorAll('path')[1]!.getAttribute('stroke'),
    );
    expect(strings.slice(0, 3)).toEqual(Array(3).fill('#ece2c8'));
    // A soundhole, a rosette and the tie block's mosaic; no pickups.
    expect(svg.querySelectorAll('path[stroke-dasharray]').length).toBeGreaterThanOrEqual(2);
    expect(svg.querySelectorAll('rect[width="80"]')).toHaveLength(0);
  });

  it('draws a steel-string acoustic with the solid head and a teardrop guard', () => {
    render(
      <GuitarArt
        spec={look({ body: { name: 'Dreadnought', render: { shape: 'dreadnought' } } })}
        size={20}
      />,
    );
    const svg = screen.getByRole('img');
    expect(svg).toHaveAccessibleName(/^Dreadnought guitar, cherry sunburst, cream pickguard, /);
    expect(svg.querySelectorAll('path[fill="#efe3c8"]')).toHaveLength(1);
    expect(svg.querySelectorAll('path[fill="#140f0c"]')).toHaveLength(0);
    expect(svg.querySelectorAll('circle[r="3.1"]')).toHaveLength(6);
  });

  it('paints the board wood and the hardware colour', () => {
    render(<GuitarArt spec={look()} size={20} />);
    const svg = screen.getByRole('img');
    expect(svg.querySelector('path[fill="#4a2f22"]')).not.toBeNull();
    const metal = svg.querySelector('linearGradient[id$="-metal"] stop[offset="0.45"]');
    expect(metal).toHaveAttribute('stop-color', '#d4b15a');
  });

  it.each([
    ['dots', 10],
    ['blocks', 9],
    ['trapezoids', 9],
  ] as const)('draws %s at the nine standard positions', (shape, paths) => {
    render(<GuitarArt spec={look({ inlay: { name: shape, render: { shape } } })} size={20} />);
    expect(screen.getByRole('img').querySelectorAll('path[fill="#e8dfd2"]')).toHaveLength(paths);
  });

  it('takes a label override', () => {
    render(<GuitarArt spec={look()} size={20} label="Your guitar: Big Red" />);
    expect(screen.getByRole('img', { name: 'Your guitar: Big Red' })).toBeInTheDocument();
  });

  it('gives each guitar on a page its own paint ids', () => {
    render(
      <>
        <GuitarArt spec={look()} size={20} />
        <GuitarArt spec={look()} size={20} />
      </>,
    );
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('frames the body alone, or fills its container', () => {
    const { rerender } = render(<GuitarArt spec={look()} size={6} crop="body" />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('viewBox', '-185 300 370 502');
    expect(svg.style.height).toBe('6rem');
    rerender(<GuitarArt spec={look()} size="fill" />);
    expect(screen.getByRole('img').style.width).toBe('100%');
  });
});
