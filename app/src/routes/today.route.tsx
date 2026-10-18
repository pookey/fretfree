import type { NavEntry, RouteLayout } from './registry';
import { firstLaunchGuard } from '../onboarding/guard';
import { TodayScreen } from '../screens/today/TodayScreen';

export const path = '/';
export const layout: RouteLayout = 'shell';
export const nav: NavEntry = { label: 'Today', icon: '☀︎', order: 10 };
export const element = <TodayScreen />;
export const guard = firstLaunchGuard;
