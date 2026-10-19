import { lazyElement } from './lazy-element';
import type { NavEntry, RouteLayout } from './registry';
import { TOOLS, toolsNav } from '../screens/tools/registry';

// In the nav only once a tool is registered (design §7 Tools). Lazy: only the
// tool list's metadata is in first-load JS.
export const path = '/tools';
export const layout: RouteLayout = 'shell';
export const nav: NavEntry | undefined = toolsNav(TOOLS);
export const element = lazyElement(
  () => import('../screens/tools/ToolsScreen').then((m) => m.ToolsScreen),
  'Tools',
);
