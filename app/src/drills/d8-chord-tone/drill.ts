import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D8Answer, D8Prompt } from './logic';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import { D8_ID, D8_SCOPE, d8CanTest, d8ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d8-chord-tone', (l: typeof logic) => ({
  makePrompt: l.d8MakePrompt,
  check: l.d8Check,
  describeAnswer: l.d8DescribeAnswer,
  sounds: l.d8Sounds,
  feedbackPositions: l.d8FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d8-chord-tone', lazy);

const chordTone: DrillType<D8Prompt, D8Answer> = {
  id: D8_ID,
  title: 'Find the chord tone in a shape',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D8_ID)).map((s) => s.id),
  inputModes: ['tap', 'choice', 'keyboard'],
  scope: D8_SCOPE,
  canTest: d8CanTest,
  conceptOf: d8ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default chordTone;
