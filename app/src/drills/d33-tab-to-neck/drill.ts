import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D33Answer, D33Prompt } from './logic';
import type * as views from './views';
import { D33_ID, D33_SCOPE, d33CanTest, d33ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d33-tab-to-neck', (l: typeof logic) => ({
  makePrompt: l.d33MakePrompt,
  check: l.d33Check,
  describeAnswer: l.d33DescribeAnswer,
  sounds: l.d33Sounds,
  feedbackPositions: l.d33FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d33-tab-to-neck', lazy);

const tabToNeck: DrillType<D33Prompt, D33Answer> = {
  id: D33_ID,
  title: 'Tab → neck',
  // Every skill that names this drill: the TAB string skills.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D33_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D33_SCOPE,
  canTest: d33CanTest,
  conceptOf: d33ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default tabToNeck;
