import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D11Answer, D11Prompt } from './logic';
import type * as views from './views';
import { D11_ID, D11_SCOPE, d11CanTest, d11ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d11-numerals', (l: typeof logic) => ({
  makePrompt: l.d11MakePrompt,
  check: l.d11Check,
  describeAnswer: l.d11DescribeAnswer,
  sounds: l.d11Sounds,
}));
const parts = lazyParts<typeof views>('d11-numerals', lazy);

const numerals: DrillType<D11Prompt, D11Answer> = {
  id: D11_ID,
  title: 'Roman numeral ↔ chord in a key',
  // Every skill that names this drill: C8 now, and I4's minor-key numerals
  // when they list `numerals`, without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D11_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D11_SCOPE,
  canTest: d11CanTest,
  conceptOf: d11ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default numerals;
