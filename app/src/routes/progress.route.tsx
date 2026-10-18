import type { NavEntry, RouteLayout } from './registry';
import { ProgressScreen } from '../screens/progress/ProgressScreen';

export const path = '/progress';
export const layout: RouteLayout = 'shell';
export const nav: NavEntry = { label: 'Progress', icon: '▤', order: 40 };
export const element = <ProgressScreen />;
