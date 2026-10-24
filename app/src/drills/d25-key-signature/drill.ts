import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D25Answer, D25Prompt } from './logic';
import type * as views from './views';
import { D25_ID, D25_SCOPE, d25CanTest, d25ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d25-key-signature', (l: typeof logic) => ({
  makePrompt: l.d25MakePrompt,
  check: l.d25Check,
  describeAnswer: l.d25DescribeAnswer,
  sounds: l.d25Sounds,
  feedbackPositions: l.d25FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d25-key-signature', lazy);

const keySignatureApply: DrillType<D25Prompt, D25Answer> = {
  id: D25_ID,
  title: 'Read the key signature',
  // Every skill that names this drill (R3), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D25_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D25_SCOPE,
  canTest: d25CanTest,
  conceptOf: d25ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default keySignatureApply;
