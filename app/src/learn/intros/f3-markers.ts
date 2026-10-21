import type { ConceptIntro } from './types';

/** F3: orient from the inlays (research/03: "orient from a marker"). */
const intro: ConceptIntro = {
  id: 'f3-markers',
  for: ['F3.markers'],
  title: 'The dots on the neck',
  text: 'The dots on the neck mark frets 3, 5, 7, 9 and 12, and fret 12 has two. Use them to see where you are at a glance, instead of counting frets from the end of the neck.',
  diagram: {
    kind: 'neck',
    range: { from: 0, to: 12 },
    markers: [],
    label: 'The neck from the open strings to fret 12, with dots at frets 3, 5, 7, 9 and 12',
  },
};

export default intro;
