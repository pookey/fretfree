import type { NavEntry, RouteLayout } from './registry';
import { SettingsScreen } from '../screens/settings/SettingsScreen';

export const path = '/settings';
export const layout: RouteLayout = 'shell';
export const nav: NavEntry = { label: 'Settings', icon: '⚙︎', order: 50 };
export const element = <SettingsScreen />;
