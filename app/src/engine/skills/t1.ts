import { meterItemId } from '../items/meter';
import type { Skill } from '../model';
import { itemsOf, memo } from './helpers';

/**
 * T1: what a time signature means (research/03 track T: "read 4/4, 3/4 and
 * 2/4; say what each number means"). In simple time the top number is the
 * beats in a bar and the bottom number the note one beat lasts, so each
 * meter has three cards (research/02 rule 1), one per direction and number:
 *
 * - `meter:3/4:feltBeats`: how many beats in a bar (3);
 * - `meter:3/4:beatUnit`: what note one beat lasts (a quarter);
 * - `meter:3/4:fromBeats`: the other way round, which time signature has
 *   3 quarter-note beats in a bar.
 *
 * D32 asks them as choice cards. Sound comes before symbol (design §12):
 * the meter opens once the learner is tapping a pulse (F4), and every card's
 * feedback can play its bar on the click. Meter is a future track, so it
 * stays out of the placement test (its topics aren't probed).
 */

export const T1_DRILLS = ['simple-compound'];

/** The simple meters T1 reads; IDs are literals, which e2e seeds read from this file. */
export const T1_METERS: readonly string[] = ['4/4', '3/4', '2/4'];

export const skills: Skill[] = [
  {
    id: 'T1.simple-meters',
    topic: 'T1',
    order: 2600,
    title: 'Read a time signature: 4/4, 3/4 and 2/4',
    // Feel a pulse before reading one (sound before symbol, design §12).
    prerequisites: ['F4.pulse'],
    softUnlock: true,
    drillTypes: T1_DRILLS,
    items: memo(() =>
      itemsOf(
        'T1.simple-meters',
        T1_METERS.flatMap((m) =>
          (['feltBeats', 'beatUnit', 'fromBeats'] as const).map((f) => meterItemId(m, f)),
        ),
      ),
    ),
  },
];
