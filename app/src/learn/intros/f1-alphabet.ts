import type { ConceptIntro } from './types';

/** F1: the seven letters and how they wrap (research/03: "name the note ±1 or 2 away"). */
const intro: ConceptIntro = {
  id: 'f1-alphabet',
  for: ['F1.alphabet'],
  title: 'The musical alphabet',
  text: 'Music uses seven letters, A to G, then starts again at A. Up means the next letter; down means the one before. So the note after G is A, and the note before A is G.',
  diagram: { kind: 'wheel', guideLevel: 1, start: 'A' },
};

export default intro;
