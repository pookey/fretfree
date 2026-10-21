import type { ConceptIntro } from './types';

/** F1: whole steps, and the B–C / E–F exception that trips them up (research/03). */
const intro: ConceptIntro = {
  id: 'f1-whole-steps',
  for: ['F1.whole-steps'],
  title: 'Whole steps',
  text: 'A half step is one fret; a whole step is two: C to D. But E–F is only a half step, so a whole step up from E is F#, one fret past F.',
  diagram: { kind: 'wheel', guideLevel: 3, start: 'E' },
};

export default intro;
