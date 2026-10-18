import { ROUTES, type RouteModule } from '../routes/registry';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/** The nav entries of some routes, by `nav.order` (then path). Routes without `nav` are left out. */
export function navItems(routes: readonly Pick<RouteModule, 'path' | 'nav'>[]): NavItem[] {
  return routes
    .flatMap((r) => (r.nav ? [{ path: r.path, nav: r.nav }] : []))
    .sort((a, b) => a.nav.order - b.nav.order || a.path.localeCompare(b.path))
    .map(({ path, nav }) => ({ to: path, label: nav.label, icon: nav.icon }));
}

/**
 * The sections (design §7 navigation), generated from the route registry.
 * Settings live under Progress.
 */
export const NAV_ITEMS: readonly NavItem[] = navItems(ROUTES);
