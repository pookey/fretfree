import type { NavEntry, RouteLayout } from './registry';
import { ExploreScreen } from '../screens/explore/ExploreScreen';

export const path = '/explore';
export const layout: RouteLayout = 'shell';
export const nav: NavEntry = { label: 'Explore', icon: '⌕', order: 30 };
export const element = <ExploreScreen />;
