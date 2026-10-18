import { describe, expect, it } from 'vitest';
import { SKILLS, getSkill } from '../../engine';
import { MODULES } from '../../engine/frontier';
import { intervalBetween, noteAt } from '../../theory';
import { WORKED_EXAMPLES, exampleFor, type WorkedExample } from './index';
import { outcomeOf, stepRange } from './logic';

const byId = (id: string) => WORKED_EXAMPLES.find((e) => e.id === id)!;

describe('worked-example registry', () => {
  it('loads every example file, one ID each', () => {
    const ids = WORKED_EXAMPLES.map((e) => e.id);
    expect(ids).toEqual(
      expect.arrayContaining(['c1-octave-shapes', 'c2-gb-octaves', 'c3-gb-thirds', 'f2-landmarks']),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('targets real skills or research/03 topics', () => {
    const topics = new Set(MODULES.flatMap((m) => m.topics));
    for (const e of WORKED_EXAMPLES) {
      expect(e.for.length, e.id).toBeGreaterThan(0);
      for (const target of e.for) {
        expect(getSkill(target) !== undefined || topics.has(target), `${e.id} → ${target}`).toBe(
          true,
        );
      }
    }
  });

  it('prefers a skill-ID match over a topic match', () => {
    const topic: WorkedExample = { ...byId('c1-octave-shapes'), id: 'topic', for: ['C2'] };
    const skill: WorkedExample = { ...topic, id: 'skill', for: ['C2.all-notes'] };
    expect(exampleFor({ id: 'C2.all-notes', topic: 'C2' }, [topic, skill])?.id).toBe('skill');
    expect(exampleFor({ id: 'C2.other', topic: 'C2' }, [topic, skill])?.id).toBe('topic');
    expect(exampleFor({ id: 'X.none', topic: 'X' }, [topic, skill])).toBeUndefined();
  });

  it('gives the shipped skills their examples, and future C3 skills theirs by topic', () => {
    const example = (id: string) => exampleFor(getSkill(id)!)?.id;
    expect(example('C1.octaves')).toBe('c1-octave-shapes');
    expect(example('C1.octaves-gb-shift')).toBe('c2-gb-octaves');
    expect(example('C2.all-notes')).toBe('c2-gb-octaves');
    expect(example('F2.string6-naturals')).toBe('f2-landmarks');
    // Double octaves are a different shape; no example rather than a misleading one.
    expect(example('C1.double-octaves')).toBeUndefined();
    expect(exampleFor({ id: 'C3.thirds', topic: 'C3' })?.id).toBe('c3-gb-thirds');
    expect(SKILLS.some((s) => s.topic === 'C1')).toBe(true);
  });
});

describe('example content', () => {
  it('has three steps whose answers fit their neck windows and differ from their traps', () => {
    for (const e of WORKED_EXAMPLES) {
      expect(e.steps, e.id).toHaveLength(3);
      for (const step of e.steps) {
        const range = stepRange(step);
        expect(step.answer.fret).toBeGreaterThanOrEqual(range.from);
        expect(step.answer.fret).toBeLessThanOrEqual(range.to);
        expect(outcomeOf(step, step.answer)).toBe('correct');
        if (step.trap) expect(outcomeOf(step, step.trap.at)).toBe('trap');
      }
      // Each stage is a fresh instance, not a repeat of the one before.
      const answers = new Set(e.steps.map((s) => `${s.answer.string}:${s.answer.fret}`));
      expect(answers.size, e.id).toBe(3);
    }
  });

  it('teaches the G–B shift on octaves, with the misconception at every stage', () => {
    for (const step of byId('c2-gb-octaves').steps) {
      expect(intervalBetween(step.given[0]!, step.answer)).toBe('P8');
      expect(step.trap).toBeDefined();
    }
  });

  it('teaches octave shapes that stay clear of the G–B pair', () => {
    for (const step of byId('c1-octave-shapes').steps) {
      expect(intervalBetween(step.given[0]!, step.answer)).toBe('P8');
      expect(step.trap).toBeUndefined();
    }
  });

  it('teaches the major 3rd across the G–B pair on naturals', () => {
    for (const step of byId('c3-gb-thirds').steps) {
      expect(intervalBetween(step.given[0]!, step.answer)).toBe('M3');
      expect(step.answer.fret).toBe(step.given[0]!.fret);
      expect(noteAt(step.answer).pc).toMatch(/^[A-G]$/);
    }
  });

  it('finds string-6 naturals at the first three markers', () => {
    expect(byId('f2-landmarks').steps.map((s) => s.answer)).toEqual([
      { string: 6, fret: 3 },
      { string: 6, fret: 5 },
      { string: 6, fret: 7 },
    ]);
  });
});
