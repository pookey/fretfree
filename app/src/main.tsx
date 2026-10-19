import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installAudioUnlock } from './audio/audio';
import { installPitchDetector } from './mic/detector';
import './styles/global.css';

installAudioUnlock();
installPitchDetector();

// E2E only: a Playwright spec sets `window.__fretworkFakeMic = true` with
// `addInitScript` (never from a URL), and gets the fake pitch source back in
// its place once installed, to play notes into the mic drills. Loaded lazily,
// so it costs no first-load JS.
const fakeMicWindow = window as { __fretworkFakeMic?: unknown };
if (fakeMicWindow.__fretworkFakeMic === true) {
  void import('./mic').then(({ createFakePitchSource, setPitchSourceFactory }) => {
    const fake = createFakePitchSource();
    setPitchSourceFactory(() => fake);
    fakeMicWindow.__fretworkFakeMic = fake;
  });
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
