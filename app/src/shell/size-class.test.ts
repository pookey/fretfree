import { describe, expect, it } from 'vitest';
import { neckWindow, sizeClassFor } from './size-class';

describe('sizeClassFor', () => {
  it('classifies iPad and iPhone viewports by width', () => {
    expect(sizeClassFor(1194, 834)).toBe('regular-wide'); // iPad Pro 11 landscape
    expect(sizeClassFor(1024, 768)).toBe('regular-wide'); // iPad mini landscape
    expect(sizeClassFor(834, 1194)).toBe('regular'); // iPad Pro 11 portrait
    expect(sizeClassFor(744, 1133)).toBe('regular'); // iPad mini portrait
    expect(sizeClassFor(390, 844)).toBe('compact'); // iPhone portrait
  });

  it('treats short landscape phones as compact', () => {
    expect(sizeClassFor(852, 393)).toBe('compact');
  });
});

describe('neckWindow', () => {
  it('shows the full neck on regular-wide', () => {
    expect(neckWindow('regular-wide', 3)).toEqual({ from: 0, to: 15 });
  });

  it('shows 12 frets on regular, shifting up for high frets', () => {
    expect(neckWindow('regular', 5)).toEqual({ from: 0, to: 12 });
    expect(neckWindow('regular', 14)).toEqual({ from: 3, to: 15 });
  });

  it('slides a 5-fret window on compact', () => {
    expect(neckWindow('compact', 0)).toEqual({ from: 0, to: 4 });
    expect(neckWindow('compact', 7)).toEqual({ from: 5, to: 9 });
    expect(neckWindow('compact', 15)).toEqual({ from: 11, to: 15 });
  });
});
