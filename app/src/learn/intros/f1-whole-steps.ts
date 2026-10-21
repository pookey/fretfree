import type { ConceptIntro } from './types';

/** F1: whole steps, and the B–C / E–F exception that trips them up (research/03). */
const intro: ConceptIntro = {
  id: 'f1-whole-steps',
  for: ['F1.whole-steps'],
  title: 'Whole steps',
  text: 'A whole step is two half steps: two frets. From most letters, a whole step up is the next letter: C to D. But E–F is only a half step, so a whole step up from E is F#.',
  diagram: { kind: 'wheel', guideLevel: 3, start: 'E' },
};

export default intro;
