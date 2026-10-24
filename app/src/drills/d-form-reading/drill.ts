import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { FormReadingAnswer, FormReadingPrompt } from './logic';
import type * as views from './views';
import {
  FORM_READING_ID,
  FORM_READING_SCOPE,
  formReadingCanTest,
  formReadingConceptOf,
} from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d-form-reading', (l: typeof logic) => ({
  makePrompt: l.formReadingMakePrompt,
  check: l.formReadingCheck,
  describeAnswer: l.formReadingDescribeAnswer,
  gradedResponseMs: l.formReadingGradedResponseMs,
  sounds: l.formReadingSounds,
}));
const parts = lazyParts<typeof views>('d-form-reading', lazy);

const formReading: DrillType<FormReadingPrompt, FormReadingAnswer> = {
  id: FORM_READING_ID,
  title: 'Read the form: pickups, repeats and endings',
  // Every skill that names this drill (T6), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(FORM_READING_ID)).map((s) => s.id),
  inputModes: ['tap', 'choice', 'keyboard'],
  scope: FORM_READING_SCOPE,
  canTest: formReadingCanTest,
  conceptOf: formReadingConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default formReading;
