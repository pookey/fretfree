import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { flattenPath, inside } from './footprint';
import { SCALE, boardHalfWidth, fretY, stringX, tunerPost } from './geometry';
import {
  Board,
  HeelShadow,
  Headstock,
  NYLON,
  SLOT,
  SLOTTED_PATH,
  Strings,
  neckHalfWidth,
  neckStringX,
  stringAnchor,
} from './Neck';
import type { Paints } from './parts';
import { ROSEWOOD } from './test/fixtures';
import type { NeckKind } from './types';

const PAINTS: Paints = { metal: '#c8ccd2', colour: '#c8ccd2', plastic: '#141110' };
const NECKS: NeckKind[] = ['electric', 'acoustic', 'classical'];

function svg(children: React.ReactNode) {
  return render(<svg>{children}</svg>).container.querySelector('svg')!;
}

describe('neck widths', () => {
  it('keeps the electric neck exactly as the shared geometry draws it', () => {
    for (const y of [0, 200, 400]) {
      expect(neckHalfWidth('electric', y)).toBe(boardHalfWidth(y));
      expect(neckStringX('electric', 6, y)).toBe(stringX(6, y));
    }
  });

  it('widens from electric to steel-string acoustic to classical', () => {
    for (const y of [0, fretY(12), fretY(19)]) {
      expect(neckHalfWidth('acoustic', y)).toBeGreaterThan(neckHalfWidth('electric', y));
      expect(neckHalfWidth('classical', y)).toBeGreaterThan(neckHalfWidth('acoustic', y) + 2);
    }
    // A classical nut is 52 mm across.
    expect(neckHalfWidth('classical', 0) * 2).toBe(52);
  });

  it.each(NECKS)('keeps the low E on the left and every string on a %s board', (neck) => {
    for (const y of [0, fretY(12), fretY(19)]) {
      const xs = [1, 2, 3, 4, 5, 6].map((s) => neckStringX(neck, s, y));
      expect(xs).toEqual([...xs].sort((a, b) => b - a));
      for (const x of xs) expect(Math.abs(x)).toBeLessThan(neckHalfWidth(neck, y) - 2);
    }
    // Spread wider at the saddles than at the nut.
    expect(neckStringX(neck, 1, SCALE)).toBeGreaterThan(neckStringX(neck, 1, 0));
  });
});

describe('<Board>', () => {
  it('shades a radiused board at its edges, and leaves a flat classical board even', () => {
    const shades = (neck: NeckKind) =>
      svg(<Board palette={ROSEWOOD} inlay="dots" frets={19} neck={neck} />).querySelectorAll(
        'path[fill="#000"]',
      ).length;
    expect(shades('electric')).toBe(2);
    expect(shades('acoustic')).toBe(2);
    expect(shades('classical')).toBe(0);
  });

  it('widens the inlays and the nut with the board', () => {
    const el = svg(<Board palette={ROSEWOOD} inlay="blocks" frets={19} neck="classical" />);
    const scaled = [...el.querySelectorAll('g[transform^="scale("]')];
    expect(scaled.length).toBe(8);
    for (const g of scaled) {
      expect(Number(/scale\(([\d.]+)/.exec(g.getAttribute('transform')!)![1])).toBeGreaterThan(1);
    }
    expect(el.querySelector('rect')).toHaveAttribute('width', '52');
    // The electric board needs no scaling.
    const electric = svg(<Board palette={ROSEWOOD} inlay="blocks" frets={22} />);
    expect(electric.querySelectorAll('g[transform^="scale("]')).toHaveLength(0);
  });

  it('casts the heel shadow to the width of the neck', () => {
    const d = (neck: NeckKind) =>
      svg(<HeelShadow frets={19} from={324} neck={neck} />)
        .querySelector('path')!
        .getAttribute('d')!;
    expect(d('classical')).not.toBe(d('electric'));
  });
});

describe('headstocks', () => {
  it('draws the solid three-a-side head by default', () => {
    const el = svg(<Headstock palette={ROSEWOOD} paints={PAINTS} />);
    expect(el.querySelectorAll('circle[r="6.5"]')).toHaveLength(6);
    expect(el.querySelectorAll('ellipse')).toHaveLength(0);
  });

  it('draws a slotted head: two slots, a roller per string, a button per roller', () => {
    const el = svg(<Headstock palette={ROSEWOOD} paints={PAINTS} kind="slotted" />);
    expect(el.querySelector(`path[d="${SLOTTED_PATH}"]`)).not.toBeNull();
    expect(el.querySelectorAll('path[fill="#140f0c"]')).toHaveLength(2);
    // Rollers: a cream bar across a slot, three a side.
    expect(el.querySelectorAll('rect[fill="#e9e0cf"]')).toHaveLength(6);
    // Buttons and their highlights.
    expect(el.querySelectorAll('ellipse')).toHaveLength(12);
  });

  it('runs each string to its post, or to its roller inside a slot', () => {
    for (const s of [1, 2, 3, 4, 5, 6]) expect(stringAnchor(s)).toEqual(tunerPost(s));
    const head = flattenPath(SLOTTED_PATH);
    const anchors = [1, 2, 3, 4, 5, 6].map((s) => stringAnchor(s, 'slotted'));
    expect(new Set(anchors.map((a) => `${a.x},${a.y}`)).size).toBe(6);
    for (const [i, a] of anchors.entries()) {
      expect(inside(a, head)).toBe(true);
      expect(Math.abs(a.x)).toBeGreaterThan(SLOT.inner);
      expect(Math.abs(a.x)).toBeLessThan(SLOT.outer);
      expect(a.y).toBeLessThan(SLOT.bottom);
      expect(a.y).toBeGreaterThan(SLOT.top);
      // Basses in the bass-side slot.
      expect(Math.sign(a.x)).toBe(i >= 3 ? -1 : 1);
    }
    // The inner strings take the rollers nearest the nut, so no strings cross.
    expect(stringAnchor(3, 'slotted').y).toBeGreaterThan(stringAnchor(1, 'slotted').y);
    expect(stringAnchor(4, 'slotted').y).toBeGreaterThan(stringAnchor(6, 'slotted').y);
  });
});

describe('<Strings>', () => {
  const colours = (el: SVGSVGElement) =>
    [...el.querySelectorAll('g[data-string]')].map((g) =>
      g.querySelectorAll('path')[1]!.getAttribute('stroke'),
    );

  it('draws six steel strings in the palette colour', () => {
    const el = svg(<Strings palette={ROSEWOOD} end={655} neck="acoustic" />);
    expect(colours(el)).toEqual(Array(6).fill(ROSEWOOD['--string']));
  });

  it('draws nylon trebles and wound basses on a classical', () => {
    const el = svg(<Strings palette={ROSEWOOD} end={657} neck="classical" headstock="slotted" />);
    expect(colours(el)).toEqual([NYLON, NYLON, NYLON, ...Array(3).fill(ROSEWOOD['--string'])]);
    // Each string starts at its roller.
    const first = el.querySelector('g[data-string="1"] path')!.getAttribute('d')!;
    const a = stringAnchor(1, 'slotted');
    expect(first.startsWith(`M ${a.x} ${a.y}`)).toBe(true);
  });
});
