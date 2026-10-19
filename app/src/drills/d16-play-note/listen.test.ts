import { describe, expect, it } from 'vitest';
import { createFakePitchSource, type NoteEnd, type StableNote } from '../../mic';
import { createD16Listener } from './listen';

/** A fake source wired to a listener, recording the notes that answer. */
async function rig() {
  const source = createFakePitchSource();
  const listener = createD16Listener(100);
  const answers: string[] = [];
  source.onFrame((f) => listener.frame(f.at));
  source.onNote((n) => {
    if (listener.note(n)) answers.push(n.name);
  });
  source.onNoteEnd((e) => listener.noteEnd(e));
  await source.start();
  return { source, listener, answers };
}

const note = (midi: number, startedAt: number): StableNote => ({
  midi,
  name: `m${midi}`,
  chroma: midi % 12,
  frequency: 0,
  cents: 0,
  startedAt,
  stableAt: startedAt + 80,
});
const end = (n: StableNote, endedAt: number): NoteEnd => ({ note: n, endedAt });

describe('createD16Listener', () => {
  it('lets a note answer before any prompt is pinned', async () => {
    const { source, answers } = await rig();
    source.play('A2');
    expect(answers).toEqual(['A2']);
  });

  it('ignores a note still ringing from before the prompt, and says it is ringing', async () => {
    const { source, listener, answers } = await rig();
    source.play('A2', { durationMs: 200 });
    listener.prompt();
    expect(listener.ringing?.name).toBe('A2');
    source.play('A2', { durationMs: 200 });
    expect(answers).toEqual(['A2']);
    source.silence(200);
    expect(listener.ringing).toBeNull();
    source.play('A2');
    expect(answers).toEqual(['A2', 'A2']);
  });

  it('takes a new note plucked over a ringing one', async () => {
    const { source, listener, answers } = await rig();
    source.play('A2');
    listener.prompt();
    source.play('B2');
    expect(answers).toEqual(['A2', 'B2']);
  });

  it('ignores a ringing note decaying onto its octave', async () => {
    const { source, listener, answers } = await rig();
    source.play('A2');
    listener.prompt();
    source.play('A3');
    expect(answers).toEqual(['A2']);
    // A real pluck after a mute still counts.
    source.silence(200);
    source.play('A3');
    expect(answers).toEqual(['A2', 'A3']);
  });

  it('only treats an octave jump as a takeover when it follows the old note at once', () => {
    const listener = createD16Listener(100);
    const a2 = note(45, 0);
    listener.frame(0);
    expect(listener.note(a2)).toBe(true);
    listener.frame(300);
    listener.prompt();
    listener.noteEnd(end(a2, 300));
    expect(listener.note(note(57, 320))).toBe(false);
    expect(listener.note(note(57, 401))).toBe(true);
  });

  it("doesn't call a note played after the prompt a takeover", () => {
    const listener = createD16Listener(100);
    listener.frame(0);
    listener.prompt();
    const a2 = note(45, 20);
    expect(listener.note(a2)).toBe(true);
    listener.noteEnd(end(a2, 300));
    expect(listener.note(note(57, 320))).toBe(true);
  });

  it('forgets the old clock when the source restarts', async () => {
    const { source, listener, answers } = await rig();
    source.play('A2');
    listener.prompt();
    source.stop();
    // A restarted source may restart its clock below the pinned prompt.
    listener.reset();
    listener.frame(0);
    expect(listener.note(note(47, 0))).toBe(true);
    expect(answers).toEqual(['A2']);
  });

  it('keeps the ringing note when an older note ends', () => {
    const listener = createD16Listener(100);
    const a2 = note(45, 0);
    const b2 = note(47, 100);
    listener.note(a2);
    listener.note(b2);
    listener.frame(150);
    listener.prompt();
    listener.noteEnd(end(a2, 99));
    expect(listener.ringing).toBe(b2);
  });
});
