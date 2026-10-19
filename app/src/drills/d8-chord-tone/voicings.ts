import type { ChordKind } from '../../theory';

// The voicings are shared with D36 (theory/voicings.ts).
export {
  placements,
  templatesFor,
  type PlacedNote,
  type VoicingTemplate,
} from '../../theory/voicings';

/** The chord kinds D8 has shapes for. */
export type D8Kind = 'major' | 'minor' | '7' | 'maj7' | 'm7';

export const D8_KINDS: readonly D8Kind[] = ['major', 'minor', '7', 'maj7', 'm7'];

export function isD8Kind(kind: ChordKind): kind is D8Kind {
  return (D8_KINDS as readonly ChordKind[]).includes(kind);
}
