import { describe, expect, it } from 'vitest';
import { STARTER_BUILD } from '../../../engine/garage';
import { resolveLook } from '../model';
import { guitarSvg } from './render';

describe('guitarSvg', () => {
  it('serialises the guitar as a standalone SVG of the asked size, painted by attributes', async () => {
    const markup = await guitarSvg(resolveLook(STARTER_BUILD.spec), 872, 2380);
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    const svg = doc.documentElement;
    expect(svg.tagName).toBe('svg');
    expect(svg.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(svg.getAttribute('width')).toBe('872');
    expect(svg.getAttribute('height')).toBe('2380');
    expect(svg.getAttribute('viewBox')).toBe('-185 -200 370 1010');
    // Sized by its attributes only: no CSS box from the page.
    expect(svg.hasAttribute('style')).toBe(false);
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.querySelectorAll('path').length).toBeGreaterThan(10);
    // Gradients are referenced by ID inside the document itself.
    const refs = [...markup.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const id of refs) expect(doc.getElementById(id)).not.toBeNull();
  });
});
