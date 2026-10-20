import { describe, expect, it } from 'vitest';
import { TOOLS } from '../screens/tools/registry';
import { NAV_ITEMS, navItems } from '../shell/nav';
import { collectRoutes, guardLoader, ROUTES, type RouteModule } from './registry';

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
      ['/about', 'shell'],
      ['/account/verify', 'shell'],
      ['/explore', 'shell'],
      ['/learn', 'shell'],
      ['/onboarding', 'fullscreen'],
      ['/placement', 'fullscreen'],
      ['/privacy', 'shell'],
      ['/progress', 'shell'],
      ['/session', 'fullscreen'],
      ['/settings', 'shell'],
      ['/tools', 'shell'],
      ['/tools/:tool', 'shell'],
    ]);
  });

  it('generates the sections from route nav entries, in order', () => {
    // Tools joins the nav once a tool is registered (design §7 Tools).
    const tools = TOOLS.length > 0 ? [['/tools', 'Tools']] : [];
    expect(NAV_ITEMS.map((n) => [n.to, n.label])).toEqual([
      ['/', 'Today'],
      ['/learn', 'Learn'],
      ['/explore', 'Explore'],
      ...tools,
      ['/progress', 'Progress'],
      ['/settings', 'Settings'],
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
    expect(() =>
      collectRoutes({ './a.route.tsx': route('/a', { guard: '/elsewhere' as never }) }),
    ).toThrow('./a.route.tsx: `guard` must be a function');
  });

  it('guards Today with the first-launch check', () => {
    expect(ROUTES.find((r) => r.path === '/')?.guard).toBeTypeOf('function');
    expect(ROUTES.find((r) => r.path === '/onboarding')?.guard).toBeUndefined();
  });
});

describe('guardLoader', () => {
  const load = (guard: Parameters<typeof guardLoader>[0], url = 'http://app.test/') =>
    guardLoader(guard)({ request: new Request(url), params: {} } as never);

  it('redirects where the guard says', async () => {
    const res = (await load(async () => '/onboarding')) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('/onboarding');
  });

  it('renders the route when the guard returns null', async () => {
    expect(await load(() => null)).toBeNull();
  });

  it('passes the URL to the guard and never redirects to the page being loaded', async () => {
    const seen: string[] = [];
    const result = await load((url) => {
      seen.push(url.pathname);
      return url.pathname;
    }, 'http://app.test/learn');
    expect(seen).toEqual(['/learn']);
    expect(result).toBeNull();
  });
});
