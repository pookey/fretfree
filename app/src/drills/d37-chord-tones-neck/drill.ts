import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D37Answer, D37Prompt } from './logic';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import { D37_ID, D37_SCOPE, d37CanTest, d37ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d37-chord-tones-neck', (l: typeof logic) => ({
  makePrompt: l.d37MakePrompt,
  check: l.d37Check,
  describeAnswer: l.d37DescribeAnswer,
  gradedResponseMs: l.d37GradedResponseMs,
  sounds: l.d37Sounds,
  feedbackPositions: l.d37FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d37-chord-tones-neck', lazy);

const chordTonesNeck: DrillType<D37Prompt, D37Answer> = {
  id: D37_ID,
  title: 'Chord tones across the neck',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D37_ID)).map((s) => s.id),
  inputModes: ['tap'],
  scope: D37_SCOPE,
  canTest: d37CanTest,
  conceptOf: d37ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default chordTonesNeck;
