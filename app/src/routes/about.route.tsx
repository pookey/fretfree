import type { RouteLayout } from './registry';
import { AboutScreen } from '../screens/about/AboutScreen';

// No `nav`: About is reached from Settings.
export const path = '/about';
export const layout: RouteLayout = 'shell';
export const element = <AboutScreen />;
