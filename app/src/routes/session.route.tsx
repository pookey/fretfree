import type { RouteLayout } from './registry';
import { SessionScreen } from '../session/SessionScreen';

export const path = '/session';
export const layout: RouteLayout = 'fullscreen';
export const element = <SessionScreen />;
