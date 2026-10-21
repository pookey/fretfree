import { describe, expect, it } from 'vitest';
import { SKILLS, getSkill } from '../../engine';
import { wordCount } from '../intros';
import { OUTCOMES, outcomeFor } from './index';
import { loadOutcomes } from './lazy';

describe('skill-outcome registry', () => {
  it('gives every registered skill an outcome', () => {
    const missing = SKILLS.filter((s) => !outcomeFor(s.id)).map((s) => s.id);
    expect(missing, 'add these to learn/outcomes/<topic>.ts').toEqual([]);
  });

  it('names only registered skills', () => {
    const unknown = [...OUTCOMES.keys()].filter((id) => !getSkill(id));
    expect(unknown).toEqual([]);
  });

  it('keeps each topic in its own file', () => {
    // One file per topic: a skill's outcome sits in the file named after its topic.
    const files = import.meta.glob<{ default: Record<string, string> }>(
      ['./*.ts', '!./index.ts', '!./lazy.ts', '!./types.ts', '!./*.test.ts'],
      { eager: true },
    );
    for (const [path, m] of Object.entries(files)) {
      const topic = path.slice(2, -3).toUpperCase();
      for (const id of Object.keys(m.default)) expect(id.split('.')[0], path).toBe(topic);
    }
  });

  it('loads on demand, once', async () => {
    const [a, b] = await Promise.all([loadOutcomes(), loadOutcomes()]);
    expect(a).toBe(b);
    expect(a('F1.alphabet')).toBe(outcomeFor('F1.alphabet'));
    expect(a('X.none')).toBeUndefined();
  });
});

describe('outcome copy', () => {
  it('is one short sentence that says what the learner can do', () => {
    for (const [id, text] of OUTCOMES) {
      // A capital, a verb phrase, one full stop: no second sentence.
      expect(text, id).toMatch(/^[A-Z].*\.$/);
      expect(text, id).not.toMatch(/[.!?]\s/);
      expect(wordCount(text), id).toBeLessThanOrEqual(25);
    }
  });

  it('never shows a raw topic code or ASCII accidentals', () => {
    for (const [id, text] of OUTCOMES) {
      expect(text, id).not.toMatch(/\b[FCIRT]\d+\b/);
      // ♭ and ♯ as in the worked examples, not "b7" or "C#".
      expect(text, id).not.toMatch(/\bb\d|[A-G]#|\b[A-G]b\b/);
    }
  });

  it('gives a skill a line of its own, not a sibling’s', () => {
    const texts = [...OUTCOMES.values()];
    expect(new Set(texts).size).toBe(texts.length);
  });
});
