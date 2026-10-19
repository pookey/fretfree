import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cagedContent, chainMarkers } from '../../screens/explore/views/caged';
import { CagedChainMap } from './CagedChainMap';

const map = () => screen.getByTestId('caged-chain-map');

describe('<CagedChainMap>', () => {
  it('names every shape of the chain and where it sits', () => {
    render(<CagedChainMap root="C" quality="major" current="A" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'CAGED chain of C: C shape frets 0–3, A shape frets 3–5, G shape frets 5–8, ' +
        'E shape frets 8–10, D shape frets 10–13. The A shape is marked.',
    );
  });

  it('marks the current shape by its band, not only a colour', () => {
    render(<CagedChainMap root="C" quality="major" current="G" />);
    const current = map().querySelectorAll('[data-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAttribute('data-shape', 'G');
    expect(map().querySelectorAll('[data-shape]')).toHaveLength(5);
  });

  it("draws the Explore visualiser's markers, by shape as well as colour", () => {
    const { container } = render(<CagedChainMap root="A" quality="dominant7" current="E" />);
    const markers = chainMarkers(cagedContent(9, 'dominant7'), null, 'degrees');
    const dots = container.querySelectorAll('rect[class*="root"], polygon, circle');
    expect(dots).toHaveLength(markers.length);
    // Roots are squares, 5ths triangles, 7ths hexagons.
    expect(container.querySelectorAll('rect[class*="root"]').length).toBe(
      markers.filter((m) => m.style === 'root').length,
    );
    expect(container.querySelectorAll('polygon[class*="seventh"]').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('polygon[class*="fifth"]').length).toBeGreaterThan(0);
  });

  it('spells a flat root as the visualiser does', () => {
    render(<CagedChainMap root="Bb" quality="minor" current="C" accidentalPref="flat" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/^CAGED chain of Bbm:/);
  });

  it('mirrors for a left-handed player', () => {
    const right = render(<CagedChainMap root="C" quality="major" current="C" />);
    const xRight = right.container.querySelector('[data-shape="C"] rect')!.getAttribute('x');
    right.unmount();
    render(<CagedChainMap root="C" quality="major" current="C" handedness="left" />);
    const xLeft = map().querySelector('[data-shape="C"] rect')!.getAttribute('x');
    expect(Number(xLeft)).toBeGreaterThan(Number(xRight));
  });
});
