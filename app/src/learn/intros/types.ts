import type { FretMarker } from '../../components/fretboard/Fretboard';
import type { GuideLevel } from '../../engine/model';
import type { FretRange } from '../../theory';

/**
 * A concept intro (design §3.3 step 2, research/02 rules 4 and 8): the few
 * words a learner needs before the first worked rep of a new skill, so no
 * session asks them to recall something they were never told. The worked
 * rep that follows is the worked example; the intro only names the idea.
 */

/** A small neck: a fixed window with its notes named. */
export interface NeckDiagram {
  readonly kind: 'neck';
  readonly range: FretRange;
  readonly markers: readonly FretMarker[];
  /** What the diagram shows, for screen readers. */
  readonly label: string;
}

/** The 12-note wheel (D3's), faded to what the intro has defined so far. */
export interface WheelDiagram {
  readonly kind: 'wheel';
  /** 1 = letters only, 2 = adds the ½ badges and unnamed sharps, 3 = names every note. */
  readonly guideLevel: GuideLevel;
  /** A note to ring, the example the text starts from. */
  readonly start?: string;
}

export type IntroDiagram = NeckDiagram | WheelDiagram;

export interface ConceptIntro {
  readonly id: string;
  /**
   * Skill IDs or topic IDs (research/03) the intro explains. A skill-ID match
   * wins over a topic match, as for worked examples.
   */
  readonly for: readonly string[];
  readonly title: string;
  /** At most 40 words, in plain words, defining every term it uses. */
  readonly text: string;
  /** At most one small diagram. */
  readonly diagram?: IntroDiagram;
}
