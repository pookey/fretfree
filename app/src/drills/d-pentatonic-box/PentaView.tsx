import type { DrillContextPanelProps, DrillRenderProps } from '../types';
import { BoxView } from './BoxView';
import { BoxChainPanel } from './ContextPanel';
import { ScalePositionPanel } from './ScalePanel';
import { ScaleView } from './ScaleView';
import { isScalePrompt, type DpbAnswer, type DpbPrompt, type PentaPrompt } from './logic';
import type { DpsPrompt } from './scale';

/** The drill's view: a box prompt (C7) or a scale-position prompt (I7). */
export function PentaView(props: DrillRenderProps<PentaPrompt, DpbAnswer>) {
  const { prompt } = props;
  return isScalePrompt(prompt) ? (
    <ScaleView {...(props as DrillRenderProps<DpsPrompt, DpbAnswer>)} />
  ) : (
    <BoxView {...(props as DrillRenderProps<DpbPrompt, DpbAnswer>)} />
  );
}

/** The drill's context panel, for either kind of prompt. */
export function PentaPanel(props: DrillContextPanelProps<PentaPrompt, DpbAnswer>) {
  return isScalePrompt(props.prompt) ? (
    <ScalePositionPanel {...(props as DrillContextPanelProps<DpsPrompt, DpbAnswer>)} />
  ) : (
    <BoxChainPanel {...(props as DrillContextPanelProps<DpbPrompt, DpbAnswer>)} />
  );
}
