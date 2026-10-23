import { Suspense, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '../../routes/registry';
import { NAV_ITEMS } from '../../shell/nav';

describe('the Garage route', () => {
  const route = ROUTES.find((r) => r.path === '/progress/garage');

  it('is a lazy shell screen under Progress, with no nav entry of its own', () => {
    expect(route?.layout).toBe('shell');
    expect(route?.nav).toBeUndefined();
    expect((route?.element as ReactElement | undefined)?.type).toBe(Suspense);
    expect(NAV_ITEMS.some((n) => n.to === '/progress')).toBe(true);
  });
});
