import { lazyElement } from './lazy-element';
import type { RouteLayout } from './registry';

// One tool (design §7 Tools), reached from the Tools index. No `nav`: the
// Tools entry stays highlighted, as `/tools` prefixes this path.
export const path = '/tools/:tool';
export const layout: RouteLayout = 'shell';
export const element = lazyElement(
  () => import('../screens/tools/ToolsScreen').then((m) => m.ToolScreen),
  'tool',
);
