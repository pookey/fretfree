import type { RouteLayout } from './registry';
import { PrivacyScreen } from '../screens/privacy/PrivacyScreen';

// No `nav`: Privacy is reached from Settings and About.
export const path = '/privacy';
export const layout: RouteLayout = 'shell';
export const element = <PrivacyScreen />;
