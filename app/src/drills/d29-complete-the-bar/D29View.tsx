import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Staff, type StaffNote, type StaffNoteStyle } from '../../components/staff';
import type { GuideLevel } from '../../engine/model';
import {
  barLength,
  durationCode,
  formatRhythm,
  fracSub,
  rhythmLength,
  type RhythmEvent,
} from '../../theory';
import type { Metronome } from '../../timing/metronome';
import type { DrillRenderProps } from '../types';
import { BarRuler, type SegmentMark } from './BarRuler';
import { HearBar } from './HearBar';
import {
  d29Bar,
  d29KeyAction,
  d29Verdict,
  insertValue,
  moveValue,
  rhythmOf,
  signatureOf,
  valueName,
  type D29Answer,
  type D29Prompt,
} from './logic';
import { NoteGlyph } from './NoteGlyph';
import {
  d29Explain,
  d29Fact,
  d29Guides,
  d29Task,
  d29WorkedExample,
  placedLabel,
  roomLabel,
  spokenMeter,
} from './text';
import styles from './D29View.module.css';

export interface D29ViewProps extends DrillRenderProps<D29Prompt, D29Answer> {
  /** The timing engine's shared click; tests pass a fake. */
  metronome?: Metronome;
}

/** Pointer travel (px) before a press becomes a drag rather than a tap. */
const DRAG_THRESHOLD = 8;

/** Rhythm is drawn on the middle line: B3 sounds as the 8vb clef's written B4. */
const LINE_PITCH = ['B3'];

interface Edit {
  prompt: D29Prompt;
  placed: string[];
  /** Earlier fills, for Undo. */
  history: string[][];
}

/** A value in motion: from the palette (`from` null) or a placed one. */
interface Carried {
  code: string;
  from: number | null;
}

interface PointerDrag extends Carried {
  x: number;
  y: number;
  /** Where it would land: an index to put it at, or null off the bar. */
  at: number | null;
}

function fresh(prompt: D29Prompt): Edit {
  return { prompt, placed: [], history: [] };
}

/** Where a drop at a point lands: before the placed value under it, at the end of the bar, or off it. */
function dropAt(x: number, y: number, count: number): number | null {
  const el = document.elementFromPoint?.(x, y);
  const chip = el?.closest<HTMLElement>('[data-placed-index]');
  if (chip) return Number(chip.dataset.placedIndex);
  return el?.closest('[data-d29-bar]') ? count : null;
}

function staffNotes(bar: readonly RhythmEvent[], styleOf: (i: number) => StaffNoteStyle) {
  return bar.map((e, i): StaffNote => ({
    pitches: e.rest ? [] : LINE_PITCH,
    value: durationCode(e.value) as StaffNote['value'],
    dots: e.dots ?? 0,
    style: styleOf(i),
  }));
}

/** A time signature as it is printed: the top number over the bottom one. */
function Signature({ meter }: { meter: string }) {
  const [top, bottom] = meter.split('/');
  return (
    <span className={styles.signature} role="img" aria-label={spokenMeter(meter)}>
      <span>{top}</span>
      <span>{bottom}</span>
    </span>
  );
}

/**
 * D29 view (design §6 D29): the time signature, the bar on the staff with
 * its given start, and a palette of note values. A value is dragged onto the
 * bar with a pointer (finger, Pencil or trackpad), or tapped to add it at
 * the end; the number keys add one too. A placed value is tapped (or
 * Delete) to take it out, dragged or moved with the arrow keys to reorder,
 * and dragged off the bar to remove. Checking is explicit, so a slip can be
 * undone first.
 *
 * Guides fade (research/02 rule 9): the bar drawn to scale shows from guide
 * level 1, its beats and the room left from level 2. Feedback draws both,
 * marks the notes that hide a beat on the staff and the scale, says why,
 * and shows one way to fill the bar, with a button to hear each.
 */
export function D29View({
  prompt,
  guideLevel,
  guided,
  sizeClass,
  feedback,
  onAnswer,
  aside,
  metronome,
}: D29ViewProps) {
  const [stored, setEdit] = useState<Edit>(() => fresh(prompt));
  // A new prompt starts with nothing placed.
  const edit = stored.prompt === prompt ? stored : fresh(prompt);
  const update = useCallback(
    (fn: (e: Edit) => Edit) => setEdit((e) => fn(e.prompt === prompt ? e : fresh(prompt))),
    [prompt],
  );
  const commit = useCallback(
    (change: (placed: string[]) => string[]) =>
      update((e) => ({ ...e, placed: change(e.placed), history: [...e.history, e.placed] })),
    [update],
  );
  const undo = useCallback(
    () =>
      update((e) => {
        const prev = e.history.at(-1);
        return prev ? { ...e, placed: prev, history: e.history.slice(0, -1) } : e;
      }),
    [update],
  );

  const [said, setSaid] = useState('');
  const [dragHeld, setDragHeld] = useState<{ prompt: D29Prompt; value: PointerDrag } | null>(null);
  const drag = dragHeld && !feedback && dragHeld.prompt === prompt ? dragHeld.value : null;
  const setDrag = useCallback(
    (value: PointerDrag | null) => setDragHeld(value && { prompt, value }),
    [prompt],
  );
  const press = useRef<(Carried & { x: number; y: number; id: number; prompt: D29Prompt }) | null>(
    null,
  );
  const dragged = useRef(false);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const paletteRef = useRef<HTMLDivElement>(null);

  const given = useMemo(() => rhythmOf(prompt.given), [prompt.given]);
  const placed = feedback ? feedback.answer.placed : edit.placed;
  const bar = useMemo(() => d29Bar(prompt, { placed }), [prompt, placed]);
  const remaining = fracSub(barLength(signatureOf(prompt.meter)), rhythmLength(bar));

  const say = useCallback(
    (what: string, after: readonly string[]) => {
      const room = fracSub(
        barLength(signatureOf(prompt.meter)),
        rhythmLength(d29Bar(prompt, { placed: [...after] })),
      );
      setSaid(`${what} ${roomLabel(room)}.`);
    },
    [prompt, setSaid],
  );

  const add = useCallback(
    (code: string, at?: number) => {
      const next = insertValue(edit.placed, at ?? edit.placed.length, code);
      commit(() => next);
      say(`Placed ${valueName(code)}.`, next);
    },
    [edit.placed, commit, say],
  );
  const remove = useCallback(
    (index: number) => {
      const code = edit.placed[index];
      if (code === undefined) return;
      const next = edit.placed.filter((_, i) => i !== index);
      commit(() => next);
      say(`Took out ${valueName(code)}.`, next);
    },
    [edit.placed, commit, say],
  );
  const move = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= edit.placed.length || from === to) return;
      commit((p) => moveValue(p, from, to));
      setSaid(`Moved to value ${to + 1} of ${edit.placed.length}.`);
    },
    [edit.placed.length, commit, setSaid],
  );

  const canCheck = edit.placed.length > 0;
  const check = useCallback(() => {
    if (edit.placed.length > 0) onAnswer({ placed: [...edit.placed] });
  }, [edit.placed, onAnswer]);

  /** Put a carried value down: in at `at`, or off the bar (removing a placed one). */
  const drop = useCallback(
    (c: Carried, at: number | null) => {
      if (c.from === null) {
        if (at !== null) add(c.code, at);
      } else if (at === null) remove(c.from);
      else move(c.from, Math.min(at > c.from ? at - 1 : at, edit.placed.length - 1));
    },
    [add, remove, move, edit.placed.length],
  );

  // Pointer drag: watched on the window so a finger can leave the tile.
  useEffect(() => {
    const moveTo = (e: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id || p.prompt !== prompt || feedback) return;
      if (!dragged.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_THRESHOLD) {
        return;
      }
      dragged.current = true;
      setDrag({
        code: p.code,
        from: p.from,
        x: e.clientX,
        y: e.clientY,
        at: dropAt(e.clientX, e.clientY, edit.placed.length),
      });
    };
    const release = (e: globalThis.PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.id) return;
      press.current = null;
      // A press from an earlier prompt, or one still down at Check, drops nothing.
      if (dragged.current && p.prompt === prompt && !feedback) {
        drop(p, dropAt(e.clientX, e.clientY, edit.placed.length));
      }
      setDrag(null);
    };
    const cancel = (e: globalThis.PointerEvent) => {
      if (press.current?.id !== e.pointerId) return;
      press.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', moveTo);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', moveTo);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [drop, prompt, feedback, setDrag, edit.placed.length]);

  const startPress = (e: PointerEvent, c: Carried) => {
    // Browsers send no click to the pressed element after a drag, so a new
    // press clears the last drag's flag.
    dragged.current = false;
    if (feedback || (e.pointerType === 'mouse' && e.button !== 0)) return;
    press.current = { ...c, x: e.clientX, y: e.clientY, id: e.pointerId, prompt };
  };

  /**
   * A click that ends a drag (on the element it started from) is not a tap.
   * A keyboard click (`detail` 0) always is: a mouse drag that ended
   * elsewhere sends no click to clear the flag (M8-06 review).
   */
  const tapped = (e: { detail: number }) => {
    if (!dragged.current || e.detail === 0) {
      dragged.current = false;
      return true;
    }
    dragged.current = false;
    return false;
  };

  // Keyboard: a focused placed value moves or goes; otherwise the shortcuts.
  useEffect(() => {
    if (feedback) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target instanceof HTMLElement ? e.target : null;
      const chip = el?.dataset.placedIndex;
      if (chip !== undefined) {
        const i = Number(chip);
        const to = { ArrowLeft: i - 1, ArrowRight: i + 1 }[e.key];
        if (to !== undefined) {
          e.preventDefault();
          move(i, to);
          chipRefs.current[Math.max(0, Math.min(to, edit.placed.length - 1))]?.focus();
          return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          remove(i);
          // Focus the value that took its place, else (none left) the first tile.
          const next = Math.min(i, edit.placed.length - 2);
          window.setTimeout(() =>
            (next >= 0
              ? chipRefs.current[next]
              : paletteRef.current?.querySelector('button')
            )?.focus(),
          );
          return;
        }
      }
      const action = d29KeyAction(e.key, prompt.palette.length);
      if (!action) return;
      // Enter on a focused button is that button's click, not "check".
      if (action.type === 'check' && e.target instanceof HTMLButtonElement) return;
      e.preventDefault();
      if (action.type === 'add') add(prompt.palette[action.index]!);
      else if (action.type === 'undo') undo();
      else check();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [feedback, prompt.palette, edit.placed.length, add, remove, move, undo, check]);

  // The worked example shows full guides (design §3.3 step 2); so does feedback.
  const level: GuideLevel = guided || feedback ? 3 : guideLevel;
  const guides = d29Guides(level);

  const verdict = feedback ? d29Verdict(prompt, feedback.answer) : null;
  const marks = new Map<number, SegmentMark>();
  if (verdict) {
    for (const h of verdict.hidden) marks.set(given.length + h.placed, 'wrong');
    if (verdict.check.ok) placed.forEach((_, i) => marks.set(given.length + i, 'correct'));
  }
  const notes = staffNotes(bar, (i) => marks.get(i) ?? 'plain');
  const explanation = feedback ? d29Explain(prompt, feedback.answer) : [];
  const solutionBar = [...given, ...rhythmOf(prompt.solution)];
  const hint =
    guided && !feedback ? new Set(rhythmOf(prompt.solution).map((e) => formatRhythm([e]))) : null;

  return (
    <div className={styles.drill} data-size-class={sizeClass} data-testid="d29-drill">
      <div className={styles.upper}>
        <div className={styles.top}>
          <div className={styles.heading}>
            <Signature meter={prompt.meter} />
            <p className={styles.prompt} id="drill-prompt">
              {guided ? (
                <>{d29WorkedExample(prompt)} Tap or drag them in, then check, to continue.</>
              ) : (
                d29Task(prompt)
              )}
            </p>
          </div>

          <div
            className={styles.bar}
            data-d29-bar
            data-testid="d29-bar"
            data-target={drag && drag.at !== null ? 'true' : undefined}
          >
            {/* In feedback, the learner's bar beside one right way, each to hear. */}
            <div className={styles.staves}>
              <figure className={styles.stave}>
                {feedback && !feedback.result.correct && <figcaption>Your bar</figcaption>}
                <div className={styles.staffBox}>
                  <Staff
                    notes={notes}
                    timeSignature={prompt.meter}
                    revealPitches={false}
                    label={`Your bar in ${spokenMeter(prompt.meter)}`}
                  />
                </div>
                {feedback && (
                  <HearBar
                    rhythm={formatRhythm(bar)}
                    meter={prompt.meter}
                    label="Hear your bar"
                    metronome={metronome}
                  />
                )}
              </figure>
              {feedback && !feedback.result.correct && (
                <figure className={styles.stave} data-testid="d29-solution">
                  <figcaption>One way to fill it</figcaption>
                  <div className={styles.staffBox}>
                    <Staff
                      notes={staffNotes(solutionBar, (i) =>
                        i < given.length ? 'plain' : 'correct',
                      )}
                      timeSignature={prompt.meter}
                      revealPitches={false}
                      label="One way to fill the bar"
                    />
                  </div>
                  <HearBar
                    rhythm={formatRhythm(solutionBar)}
                    meter={prompt.meter}
                    label="Hear this bar"
                    metronome={metronome}
                  />
                </figure>
              )}
            </div>
            {guides.scale && (
              <BarRuler
                meter={prompt.meter}
                bar={bar}
                givenCount={given.length}
                marks={marks}
                beatLines={guides.beatLines}
              />
            )}
            <ol className={styles.values} aria-label="Values in the bar" data-testid="d29-values">
              {given.map((e, i) => (
                <li key={`g${i}`}>
                  <span
                    className={styles.chip}
                    data-given
                    role="img"
                    aria-label={`Given: ${valueName(formatRhythm([e]))}`}
                  >
                    <NoteGlyph code={formatRhythm([e])} className={styles.glyph} />
                  </span>
                </li>
              ))}
              {placed.map((code, i) => (
                <li key={`p${i}`}>
                  <button
                    type="button"
                    ref={(el) => {
                      chipRefs.current[i] = el;
                    }}
                    className={styles.chip}
                    data-placed-index={i}
                    data-testid="d29-placed"
                    data-mark={marks.get(given.length + i)}
                    data-target={drag?.at === i && drag.from !== i ? 'true' : undefined}
                    disabled={Boolean(feedback)}
                    aria-label={placedLabel(code, i, placed.length)}
                    aria-describedby={feedback ? undefined : 'd29-chip-how'}
                    onPointerDown={(e) => startPress(e, { code, from: i })}
                    onClick={(e) => {
                      if (tapped(e)) remove(i);
                    }}
                  >
                    <NoteGlyph code={code} className={styles.glyph} />
                    {marks.get(given.length + i) && (
                      <span className={styles.mark} aria-hidden="true">
                        {marks.get(given.length + i) === 'correct' ? '✓' : '✗'}
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {!feedback && (
                <li className={styles.slot} aria-hidden="true" data-testid="d29-drop">
                  {placed.length === 0 ? 'Drop here' : '+'}
                </li>
              )}
            </ol>
            {guides.beatLines && !feedback && (
              <p className={styles.room} data-testid="d29-room">
                {roomLabel(remaining)}
              </p>
            )}
          </div>

          {feedback && (
            <div className={styles.feedback} data-testid="d29-feedback">
              {explanation.length > 0 && (
                <ul className={styles.explanation} data-testid="d29-explanation">
                  {explanation.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              <p>{d29Fact(prompt.meter)}</p>
            </div>
          )}
        </div>
        {sizeClass === 'regular-wide' && aside}
      </div>

      {!feedback && (
        <div className={styles.answer}>
          <p id="d29-how" className={styles.hint}>
            Drag a value onto the bar, or tap it to add it at the end.
          </p>
          <div
            ref={paletteRef}
            className={styles.palette}
            role="group"
            aria-label="Note values"
            aria-describedby="d29-how"
          >
            {prompt.palette.map((code, i) => (
              <button
                key={code}
                type="button"
                className={styles.tile}
                data-tile={code}
                data-hint={hint?.has(code) ? 'true' : undefined}
                data-grabbed={drag?.from === null && drag.code === code ? 'true' : undefined}
                aria-label={capitalise(valueName(code))}
                aria-keyshortcuts={String(i + 1)}
                onPointerDown={(e) => startPress(e, { code, from: null })}
                onClick={(e) => {
                  if (tapped(e)) add(code);
                }}
              >
                <NoteGlyph code={code} className={styles.glyph} />
                <span className={styles.tileName}>{shortName(code)}</span>
              </button>
            ))}
          </div>
          <p id="d29-chip-how" className="visually-hidden">
            Tap a placed value, or press Delete, to take it out. The arrow keys move it.
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondary}
              onClick={undo}
              disabled={edit.history.length === 0}
              aria-keyshortcuts="Backspace"
            >
              Undo
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={check}
              disabled={!canCheck}
              aria-keyshortcuts="Enter"
            >
              Check
            </button>
          </div>
        </div>
      )}
      <p className="visually-hidden" role="status" data-testid="d29-status">
        {said}
      </p>
      {drag && (
        <div
          className={styles.dragGhost}
          style={{ left: drag.x, top: drag.y }}
          aria-hidden="true"
          data-testid="d29-drag"
        >
          <NoteGlyph code={drag.code} className={styles.glyph} />
        </div>
      )}
      {/* iPad portrait: below. Compact: the session styles it as a sheet. */}
      {sizeClass !== 'regular-wide' && aside}
    </div>
  );
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A tile's caption: the value's name, with the sixteenth shortened to fit. */
function shortName(code: string): string {
  return capitalise(valueName(code).replace('sixteenth', '16th'));
}
