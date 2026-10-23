import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, STARTER_SPEC, catalogueItem, type CatalogueItem } from '../../engine/garage';
import { GuitarArt } from './GuitarArt';
import { hasBody } from './shapes';
import type { GuitarLook } from './types';

/** Resolve a spec's catalogue IDs into the renderer's parts, as the Garage will. */
function resolve(spec: typeof STARTER_SPEC): GuitarLook {
  const part = (id: string): CatalogueItem => {
    const item = catalogueItem(id);
    if (!item) throw new Error(`no catalogue item ${id}`);
    return item;
  };
  return Object.fromEntries(
    CATEGORIES.map((c) => [c, { name: part(spec[c]).name, render: part(spec[c]).render }]),
  ) as unknown as GuitarLook;
}

describe('the starter guitar (M11-01 catalogue)', () => {
  const look = resolve(STARTER_SPEC);

  it('has a drawn body', () => {
    expect(hasBody(look.body.render.shape)).toBe(true);
  });

  it('renders and reads as the starter build', () => {
    render(<GuitarArt spec={look} size={20} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /^Stratocaster guitar, red, white pickguard, chrome hardware, rosewood neck with dot inlays$/,
    );
  });
});
