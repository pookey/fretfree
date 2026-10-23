import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D32Answer, D32Prompt } from './logic';
import type * as views from './views';
import { D32_ID, D32_SCOPE, d32CanTest, d32ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d32-simple-compound', (l: typeof logic) => ({
  makePrompt: l.d32MakePrompt,
  check: l.d32Check,
  describeAnswer: l.d32DescribeAnswer,
  sounds: l.d32Sounds,
}));
const parts = lazyParts<typeof views>('d32-simple-compound', lazy);

const simpleOrCompound: DrillType<D32Prompt, D32Answer> = {
  id: D32_ID,
  title: 'Simple or compound? How many felt beats?',
  // Every skill that names this drill (T1, T2), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D32_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D32_SCOPE,
  canTest: d32CanTest,
  conceptOf: d32ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default simpleOrCompound;
