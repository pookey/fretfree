import type { RouteLayout } from './registry';
import { AboutScreen } from '../screens/about/AboutScreen';

// No `nav`: About is reached from Progress → Settings (design §7 keeps four sections).
export const path = '/about';
export const layout: RouteLayout = 'shell';
export const element = <AboutScreen />;
