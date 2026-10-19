import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudioUnlock } from './audio/audio';
import { installPitchDetector } from './mic/detector';
import './styles/global.css';

installAudioUnlock();
installPitchDetector();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
