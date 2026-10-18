import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, navItems } from '../shell/nav';
import { collectRoutes, ROUTES, type RouteModule } from './registry';

const route = (path: string, extra: Partial<RouteModule> = {}): RouteModule => ({
  path,
  element: null,
  layout: 'shell',
  ...extra,
});

describe('route registry', () => {
  it('discovers every screen from its route file', () => {
    expect(ROUTES.map((r) => [r.path, r.layout])).toEqual([
      ['/', 'shell'],
      ['/explore', 'shell'],
      ['/learn', 'shell'],
      ['/progress', 'shell'],
      ['/session', 'fullscreen'],
    ]);
  });

  it('generates the four sections from route nav entries, in order', () => {
    expect(NAV_ITEMS.map((n) => [n.to, n.label])).toEqual([
      ['/', 'Today'],
      ['/learn', 'Learn'],
      ['/explore', 'Explore'],
      ['/progress', 'Progress'],
    ]);
  });

  it('orders nav by nav.order, then path, and leaves out routes without nav', () => {
    const items = navItems([
      route('/b', { nav: { label: 'B', icon: 'b', order: 20 } }),
      route('/hidden'),
      route('/a', { nav: { label: 'A', icon: 'a', order: 20 } }),
      route('/first', { nav: { label: 'First', icon: '1', order: 5 } }),
    ]);
    expect(items).toEqual([
      { to: '/first', label: 'First', icon: '1' },
      { to: '/a', label: 'A', icon: 'a' },
      { to: '/b', label: 'B', icon: 'b' },
    ]);
  });

  it('rejects bad route files, naming the file', () => {
    expect(() => collectRoutes({ './a.route.tsx': route('a') })).toThrow(
      './a.route.tsx: `path` must start with "/"',
    );
    expect(() =>
      collectRoutes({ './a.route.tsx': route('/a', { layout: 'modal' as never }) }),
    ).toThrow('./a.route.tsx: `layout` must be one of shell, fullscreen');
    expect(() =>
      collectRoutes({ './a.route.tsx': route('/a'), './b.route.tsx': route('/a') }),
    ).toThrow('./b.route.tsx: path "/a" is already used by ./a.route.tsx');
  });
});
