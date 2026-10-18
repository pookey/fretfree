import { describe, expect, it } from 'vitest';
import { parseItemId, type ItemRef } from '../engine/model';
import { SKILLS } from '../engine/skills';
import { DRILLS, getDrill } from './registry';

/**
 * Drills that skills already name but a later work package builds, with the
 * item kinds each must serve and the backlog WP that builds it, e.g.
 * `'chord-tone': { kinds: ['chord-tone'], wp: 'M3-04' }`. The WP must be in
 * `docs/backlog.md` and not done, so a skill can't wait on a drill nobody is
 * building: a skill whose drill was never planned is a lesson that opens to
 * an empty session (F3 shipped that way until M1-37). Remove the entry when
 * the drill lands; a registered drill left here fails.
 */
const PENDING: Record<string, { kinds: readonly ItemRef['kind'][]; wp: string }> = {};

async function readBacklog(): Promise<string> {
  // Kept out of the browser bundle's module graph: tests run under Node.
  const nodeFs = 'node:fs';
  const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync(path: URL, encoding: 'utf8'): string;
  };
  // A non-literal path, so Vite doesn't rewrite `new URL(…, import.meta.url)`
  // into an asset URL (docs/ is outside the app root).
  const backlog = ['..', '..', '..', 'docs', 'backlog.md'].join('/');
  return readFileSync(new URL(backlog, import.meta.url), 'utf8');
}

/** A WP's status line, from its `### <id> ·` heading to the next heading. */
function wpStatus(backlog: string, wp: string): string | null {
  const start = backlog.indexOf(`### ${wp} ·`);
  if (start < 0) return null;
  const body = backlog.slice(start).split(/\n### /)[0] as string;
  return /\*\*Status:\*\*\s*(\S+)/.exec(body)?.[1] ?? null;
}

describe('drill registry', () => {
  it('has unique IDs and resolves by ID', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    expect(getDrill('name-the-note')?.title).toMatch(/highlighted/);
    expect(getDrill('nope')).toBeUndefined();
  });

  it('lists every skill it is named by', () => {
    for (const skill of SKILLS) {
      for (const drillId of skill.drillTypes) {
        const drill = getDrill(drillId);
        if (drill) expect(drill.skills).toContain(skill.id);
        else expect(Object.keys(PENDING), `${skill.id} → ${drillId}`).toContain(drillId);
      }
    }
  });

  it('names only skills that name it back', () => {
    for (const drill of DRILLS) {
      for (const skillId of drill.skills) {
        const skill = SKILLS.find((s) => s.id === skillId);
        expect(skill?.drillTypes, `${drill.id} → ${skillId}`).toContain(drill.id);
      }
    }
  });

  it('serves every item of every skill, or leaves it to a drill not yet built', () => {
    for (const skill of SKILLS) {
      const drills = skill.drillTypes.flatMap((id) => getDrill(id) ?? []);
      const pendingKinds = skill.drillTypes.flatMap((id) =>
        getDrill(id) ? [] : (PENDING[id]?.kinds ?? []),
      );
      for (const item of skill.items()) {
        if (drills.some((d) => d.canTest(item))) continue;
        expect(pendingKinds, item.id).toContain(parseItemId(item.id)?.kind);
      }
    }
  });

  it('ties every pending drill to an open work package, and drops built ones', async () => {
    const backlog = await readBacklog();
    for (const [drillId, { wp }] of Object.entries(PENDING)) {
      expect(getDrill(drillId), `${drillId} is built: remove it from PENDING`).toBeUndefined();
      const status = wpStatus(backlog, wp);
      expect(status, `${drillId}: ${wp} is not in docs/backlog.md`).not.toBeNull();
      expect(status, `${drillId}: ${wp} is done but the drill isn't registered`).not.toBe('done');
    }
  });

  it('reads WP statuses from the backlog', async () => {
    const backlog = await readBacklog();
    expect(wpStatus(backlog, 'M1-03')).toBe('done');
    expect(wpStatus(backlog, 'M0-00')).toBeNull();
  });
});
