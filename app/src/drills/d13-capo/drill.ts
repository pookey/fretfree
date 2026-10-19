import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D13Answer, D13Prompt } from './logic';
import type * as views from './views';
import { D13_ID, D13_SCOPE, d13CanTest, d13ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d13-capo', (l: typeof logic) => ({
  makePrompt: l.d13MakePrompt,
  check: l.d13Check,
  describeAnswer: l.d13DescribeAnswer,
  sounds: l.d13Sounds,
}));
const parts = lazyParts<typeof views>('d13-capo', lazy);

const capo: DrillType<D13Prompt, D13Answer> = {
  id: D13_ID,
  title: 'Capo calculator',
  // Every skill that names this drill: C10's capo stages.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D13_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D13_SCOPE,
  canTest: d13CanTest,
  conceptOf: d13ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default capo;
