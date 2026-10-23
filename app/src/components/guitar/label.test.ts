import { describe, expect, it } from 'vitest';
import { guitarLabel } from './label';
import { look } from './test/fixtures';

describe('guitarLabel', () => {
  it('names every part in order', () => {
    expect(guitarLabel(look())).toBe(
      'Les Paul guitar, cherry sunburst, cream pickguard, gold hardware, rosewood neck with block inlays',
    );
  });

  it('says when there is no pickguard', () => {
    const label = guitarLabel(look({ pickguard: { name: 'None', render: { colour: null } } }));
    expect(label).toContain(', no pickguard,');
  });

  it('keeps the model name as it is', () => {
    const label = guitarLabel(
      look({ body: { name: 'Stratocaster', render: { shape: 'stratocaster' } } }),
    );
    expect(label).toMatch(/^Stratocaster guitar, /);
  });

  it("doesn't repeat a noun the part's name already has", () => {
    const label = guitarLabel(
      look({
        body: { name: 'Telecaster guitar', render: { shape: 'telecaster' } },
        pickguard: { name: 'Black pickguard', render: { colour: '#111111' } },
        hardware: { name: 'Chrome hardware', render: { colour: '#c9ccd1' } },
        board: { name: 'Maple board', render: look().board.render },
      }),
    );
    expect(label).toBe(
      'Telecaster guitar, cherry sunburst, black pickguard, chrome hardware, maple neck with block inlays',
    );
  });

  it('names each inlay shape', () => {
    expect(guitarLabel(look({ inlay: { name: 'Dots', render: { shape: 'dots' } } }))).toMatch(
      /with dot inlays$/,
    );
    expect(
      guitarLabel(look({ inlay: { name: 'Trapezoids', render: { shape: 'trapezoids' } } })),
    ).toMatch(/with trapezoid inlays$/);
  });
});
