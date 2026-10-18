import type { NavEntry, RouteLayout } from './registry';
import { LearnScreen } from '../screens/learn/LearnScreen';

export const path = '/learn';
export const layout: RouteLayout = 'shell';
export const nav: NavEntry = { label: 'Learn', icon: '◎', order: 20 };
export const element = <LearnScreen />;
