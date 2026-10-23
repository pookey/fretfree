import { meterItemId, type MeterFact } from '../items/meter';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';
import { T1_DRILLS } from './t1';

/**
 * T2: simple vs compound meter (research/03 track T: "classify a time
 * signature; say how many felt beats it has"). 6/8 is **2 dotted-quarter
 * beats**, not 6, and 9/8 and 12/8 likewise; cut time (2/2) is 2 half-note
 * beats. The cards are T1's, about these meters (`meter:6/8:feltBeats`,
 * `beatUnit` and `fromBeats`), plus `meter:6/8:kind`: simple or compound.
 *
 * 6/8 and 3/4 hold the same six eighths, felt as 2 beats or 3: the classic
 * confusion. D32 keys every card by its meter, and the session builder seeds
 * that pair (`engine/confusions.ts`), so their cards meet in a session
 * (research/02 rule 6). D32 offers 3/4 on every 6/8 card for the same reason.
 *
 * Odd meters (5/8, 7/8) are neither simple nor compound: they are T7's. 3/8
 * is left out too: it is simple triple on paper (3 eighth beats), but felt in
 * one or in three by tempo, so a felt-beats card about it has no single answer.
 */

/** The compound meters; IDs are literals, which e2e seeds read from this file. */
export const T2_COMPOUND_METERS: readonly string[] = ['6/8', '12/8', '9/8'];

/** The meters the simple-or-compound cards classify: T1's and the compound ones. */
export const T2_CLASSIFIED_METERS: readonly string[] = ['6/8', '3/4', '4/4', '12/8', '9/8', '2/4'];

const ids = (meters: readonly string[], facts: readonly MeterFact[]) =>
  meters.flatMap((m) => facts.map((f) => meterItemId(m, f)));

interface Group {
  id: string;
  title: string;
  prerequisites: readonly string[];
  ids: () => string[];
}

const GROUPS: readonly Group[] = [
  {
    id: 'T2.compound-meters',
    title: 'Compound meter: 6/8, 12/8 and 9/8',
    // The top number counts beats only in simple time: learn that first.
    prerequisites: ['T1.simple-meters'],
    ids: () => ids(T2_COMPOUND_METERS, ['feltBeats', 'beatUnit', 'fromBeats']),
  },
  {
    id: 'T2.simple-or-compound',
    title: 'Simple or compound?',
    prerequisites: ['T2.compound-meters'],
    ids: () => ids(T2_CLASSIFIED_METERS, ['kind']),
  },
  {
    id: 'T2.cut-time',
    title: 'Cut time: 2/2',
    // Cut time is simple: classify first, then meet a half-note beat.
    prerequisites: ['T2.simple-or-compound'],
    ids: () => ids(['2/2'], ['feltBeats', 'beatUnit', 'fromBeats', 'kind']),
  },
];

export const skills: Skill[] = GROUPS.map((g, i) => ({
  id: g.id,
  topic: 'T2',
  order: 2610 + i * 10,
  title: g.title,
  prerequisites: g.prerequisites,
  // Low-risk theory, as I3: open once the prerequisites are practising.
  softUnlock: true,
  drillTypes: T1_DRILLS,
  items: memo(() => itemsOf(g.id, g.ids())),
}));
