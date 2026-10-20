import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import type { GuideLevel } from '../../engine/model';
import { shownAccidentals } from './accidentals';
import { useEngraver } from './engraver';
import {
  STEP,
  computeStaffGeometry,
  scaleFor,
  type PositionRange,
  type StaffGeometry,
} from './geometry';
import { tabVisibility } from './guide';
import {
  keyAccidentalCount,
  noteLabel,
  tupletOf,
  type StaffMark,
  type StaffNote,
  type StaffNoteStyle,
  type StaffTuplet,
} from './model';
import { ledgerLines, positionName, positionOf, type StaffPosition } from './position';
import type { Engraving } from './render';
import styles from './Staff.module.css';

export interface StaffTap {
  /**
   * The note whose column is nearest a pointer tap, if there are notes.
   * Keyboard and VoiceOver picks name a position, not a column, so leave it out.
   */
  nearestNote?: number;
}

export interface StaffProps {
  notes?: readonly StaffNote[];
  /** A VexFlow key spec: "C", "G", "Bb", "Em". */
  keySignature?: string;
  /** "4/4", "6/8"…; omitted, no time signature is drawn. */
  timeSignature?: string;
  tuplets?: readonly StaffTuplet[];
  /** Index into `notes` of the phrase cursor: drawn `current` with a caret below. */
  cursor?: number;
  marks?: readonly StaffMark[];
  /** Draw tab under the staff from each note's `tab`; guide levels fade it. */
  showTab?: boolean;
  guideLevel?: GuideLevel;
  /** Name pitches in the notes' accessible labels (off while a quiz asks for them). */
  revealPitches?: boolean;
  /** The tappable positions; by default the staff plus a step beyond the notes. */
  positionRange?: PositionRange;
  /**
   * Turns on hit-testing: a press shows a ghost note on the nearest line or
   * space, sliding moves it, and letting go picks it. Keyboard and VoiceOver
   * users get one button per position.
   */
  onTapPosition?: (position: StaffPosition, tap: StaffTap) => void;
  /** Accessible names for positions, when "line 2" isn't the right wording. */
  positionLabel?: (position: StaffPosition) => string;
  /** Accessible name for the whole staff. */
  label?: string;
  className?: string;
}

interface Ghost {
  position: StaffPosition;
  x: number;
  nearestNote?: number;
}

/**
 * Standard notation on the guitar's treble clef 8vb (design §12), engraved
 * by VexFlow, which loads on first use. Pitches are sounding pitches, as in
 * `theory/`. Pure presentation: highlights, VoiceOver labels and
 * hit-testing are drawn over the engraving from the pure layout in
 * `geometry.ts`, so they work the same whatever VexFlow draws.
 */
export function Staff({
  notes = [],
  keySignature = 'C',
  timeSignature,
  tuplets = [],
  cursor,
  marks = [],
  showTab = false,
  guideLevel = 3,
  revealPitches = true,
  positionRange,
  onTapPosition,
  positionLabel = positionName,
  label = 'Staff',
  className,
}: StaffProps) {
  const prefix = `staff${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const engraver = useEngraver();
  const host = useRef<HTMLDivElement>(null);
  const [engraving, setEngraving] = useState<{ key: string; result: Engraving } | null>(null);
  const interactive = Boolean(onTapPosition);
  const tab = showTab ? tabVisibility(guideLevel) : 'none';

  const accidentals = useMemo(() => shownAccidentals(notes, keySignature), [notes, keySignature]);
  const markPositions = marks.map((m) => m.position).join(',');
  const g = useMemo(
    () =>
      computeStaffGeometry({
        notePositions: notes.map((n) => (n.pitches ?? []).map(positionOf)),
        extraPositions: markPositions ? markPositions.split(',').map(Number) : [],
        range: positionRange,
        keyAccidentals: keyAccidentalCount(keySignature),
        timeSignature: Boolean(timeSignature),
        tab: tab !== 'none',
      }),
    [notes, markPositions, positionRange, keySignature, timeSignature, tab],
  );

  // Re-engrave only when the music changes, not its highlights.
  const specKey = JSON.stringify([
    notes.map(({ style: _style, ...n }) => n),
    keySignature,
    timeSignature,
    tuplets,
    tab !== 'none',
    g.height,
    g.width,
  ]);
  useLayoutEffect(() => {
    if (!engraver || !host.current) return;
    const result = engraver.engrave(host.current, {
      notes,
      accidentals,
      keySignature,
      timeSignature,
      tuplets,
      tab: tab !== 'none',
      geometry: g,
      idPrefix: prefix,
    });
    setEngraving({ key: specKey, result });
    // `specKey` stands for the spec's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engraver, specKey, prefix]);
  const engraved = engraving?.key === specKey ? engraving.result : null;

  const styleOf = (n: StaffNote, i: number): StaffNoteStyle =>
    n.style ?? (i === cursor ? 'current' : 'plain');
  const styleKey = notes.map(styleOf).join(',');
  useLayoutEffect(() => {
    if (!engraved || !host.current) return;
    styleKey.split(',').forEach((style, i) => {
      host.current
        ?.querySelector(`[id="vf-${prefix}-n${i}"]`)
        ?.setAttribute('data-style', style || 'plain');
    });
  }, [engraved, styleKey, prefix]);

  const width = engraved?.width ?? g.width;
  const scale = scaleFor(interactive);
  const answerX = engraved ? (engraved.noteStartX + engraved.noteEndX) / 2 : g.answerX;
  const nearestNote = (x: number) => nearest(engraved, x);
  const markX = (m: StaffMark) =>
    (m.at !== undefined ? engraved?.notes[m.at]?.x : undefined) ?? answerX;

  return (
    <div
      className={[styles.staff, className].filter(Boolean).join(' ')}
      style={
        {
          '--staff-min': `${Math.ceil(width * scale.min)}px`,
          '--staff-max': `${Math.ceil(width * scale.max)}px`,
          aspectRatio: `${width} / ${g.height}`,
        } as CSSProperties
      }
      role="group"
      aria-label={label}
      data-ready={engraved ? 'true' : 'false'}
      data-tab={tab}
      data-guide-level={guideLevel}
      data-interactive={interactive || undefined}
    >
      <svg className={styles.layer} viewBox={`0 0 ${width} ${g.height}`} aria-hidden="true">
        {engraved &&
          notes.map((n, i) => {
            const at = engraved.notes[i];
            const style = styleOf(n, i);
            if (!at || style === 'plain') return null;
            return at.ys.map((y, k) => (
              <Halo key={`h${i}-${k}-${style}`} style={style} x={at.x} y={y} />
            ));
          })}
      </svg>

      <div ref={host} className={styles.engraving} aria-hidden="true" />

      <Overlay
        g={g}
        width={width}
        interactive={interactive}
        positionLabel={positionLabel}
        nearestNote={nearestNote}
        ghostX={(note) => (note !== undefined ? engraved?.notes[note]?.x : undefined) ?? answerX}
        onPick={(p, tap) => onTapPosition?.(p, tap)}
      >
        {engraved &&
          notes.map((n, i) => {
            const at = engraved.notes[i];
            if (!at) return null;
            const top = Math.min(...at.ys) - 2 * STEP;
            const bottom = Math.max(...at.ys) + 2 * STEP;
            return (
              <rect
                key={`n${i}`}
                className={styles.note}
                x={at.x - 2 * STEP}
                y={top}
                width={4 * STEP}
                height={bottom - top}
                role="img"
                aria-label={noteLabel(n, {
                  revealPitch: revealPitches,
                  tuplet: tupletOf(i, tuplets),
                  accidentals: accidentals[i],
                  withTab: tab !== 'none',
                })}
                aria-current={i === cursor ? 'step' : undefined}
                data-testid="staff-note"
                data-index={i}
                data-style={styleOf(n, i)}
                data-x={Math.round(at.x)}
              />
            );
          })}

        {marks.map((m, i) => (
          <Head
            key={`m${i}-${m.style}`}
            className={`${styles.mark} ${styles[m.style]}`}
            g={g}
            position={m.position}
            x={markX(m)}
            testId="staff-mark"
            data={{ 'data-style': m.style }}
          />
        ))}

        {engraved && cursor !== undefined && engraved.notes[cursor] && (
          <path
            className={styles.caret}
            d={`M ${engraved.notes[cursor].x} ${g.positionY(g.range[0]) + STEP} l 5 8 h -10 z`}
            data-testid="staff-cursor"
            data-column={cursor}
          />
        )}
      </Overlay>
    </div>
  );
}

interface OverlayProps {
  g: StaffGeometry;
  width: number;
  interactive: boolean;
  positionLabel: (p: StaffPosition) => string;
  nearestNote: (x: number) => number | undefined;
  ghostX: (nearestNote: number | undefined) => number;
  onPick: (position: StaffPosition, tap: StaffTap) => void;
  children: ReactNode;
}

/** The top layer: note labels and marks, plus the hit bands when interactive. */
function Overlay({
  g,
  width,
  interactive,
  positionLabel,
  nearestNote,
  ghostX,
  onPick,
  children,
}: OverlayProps) {
  const svg = useRef<SVGSVGElement>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [focus, setFocus] = useState<StaffPosition>(() => clamp(4, g.range));
  const pressing = useRef(false);
  // A pointer pick is usually followed by a click, which must not pick again.
  // iOS sends none after a press that slid, so the guard only covers a click
  // that arrives promptly (by event time); a later lone click (VoiceOver,
  // Switch Control) still picks.
  const pointerPickedAt = useRef<number | null>(null);

  const positions: StaffPosition[] = [];
  for (let p = g.range[1]; p >= g.range[0]; p--) positions.push(p);

  const ghostAt = (e: PointerEvent): Ghost | null => {
    const box = svg.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return null;
    const x = ((e.clientX - box.left) * width) / box.width;
    const y = ((e.clientY - box.top) * g.height) / box.height;
    const note = nearestNote(x);
    return { position: g.positionAt(y), x: ghostX(note), nearestNote: note };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (!interactive || e.button > 0) return;
    pressing.current = true;
    pointerPickedAt.current = null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setGhost(ghostAt(e));
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pressing.current) setGhost(ghostAt(e));
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (!pressing.current) return;
    pressing.current = false;
    const picked = ghostAt(e) ?? ghost;
    setGhost(null);
    if (!picked) return;
    pointerPickedAt.current = e.timeStamp;
    setFocus(picked.position);
    onPick(picked.position, { nearestNote: picked.nearestNote });
  };
  const onPointerCancel = () => {
    pressing.current = false;
    setGhost(null);
  };

  const pickBand = (p: StaffPosition) => {
    setFocus(p);
    onPick(p, {});
  };
  // Bands delegate to the svg, so one handler serves them all.
  const bandOf = (e: { target: EventTarget }) => {
    const p = (e.target as Element).getAttribute?.('data-position');
    return p === null || p === undefined ? undefined : Number(p);
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const p = bandOf(e);
    const pickedAt = pointerPickedAt.current;
    pointerPickedAt.current = null;
    if (pickedAt !== null && e.timeStamp - pickedAt < CLICK_AFTER_POINTER_MS) return;
    if (p !== undefined) pickBand(p);
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const p = bandOf(e);
    if (p === undefined) return;
    const move = { ArrowUp: 1, ArrowDown: -1, PageUp: 2, PageDown: -2 }[e.key];
    if (move !== undefined) {
      e.preventDefault();
      const next = clamp(p + move, g.range);
      setFocus(next);
      e.currentTarget
        .querySelector<SVGElement>(`[role="button"][data-position="${next}"]`)
        ?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pickBand(p);
    }
  };
  const onFocus = (e: FocusEvent<SVGSVGElement>) => {
    const p = bandOf(e);
    if (p !== undefined) setFocus(p);
  };
  const tabStop = clamp(focus, g.range);

  return (
    <svg
      ref={svg}
      className={styles.layer}
      // Not a picture itself: it holds the notes' and positions' own roles.
      role="presentation"
      viewBox={`0 0 ${width} ${g.height}`}
      onPointerDown={interactive ? onPointerDown : undefined}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
      onPointerCancel={interactive ? onPointerCancel : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? onKeyDown : undefined}
      onFocus={interactive ? onFocus : undefined}
    >
      {children}

      {ghost && (
        <Head
          className={`${styles.mark} ${styles.ghost}`}
          g={g}
          position={ghost.position}
          x={ghost.x}
          testId="staff-ghost"
          data={{ 'data-position': String(ghost.position) }}
        />
      )}

      {interactive &&
        positions.map((p) => (
          <rect
            key={`hit${p}`}
            className={styles.hit}
            x={0}
            y={g.positionY(p) - STEP / 2}
            width={width}
            height={STEP}
            role="button"
            aria-label={positionLabel(p)}
            tabIndex={p === tabStop ? 0 : -1}
            data-position={p}
          />
        ))}
    </svg>
  );
}

/** A notehead drawn by the overlay, with its ledger lines: marks and the tap ghost. */
function Head({
  className,
  g,
  position,
  x,
  testId,
  data,
}: {
  className: string;
  g: StaffGeometry;
  position: StaffPosition;
  x: number;
  testId: string;
  data: Record<string, string>;
}) {
  const y = g.positionY(position);
  return (
    <g className={className} data-testid={testId} data-position={position} {...data}>
      {ledgerLines(position).map((l) => (
        <line
          key={l}
          className={styles.ledger}
          x1={x - 10}
          x2={x + 10}
          y1={g.positionY(l)}
          y2={g.positionY(l)}
        />
      ))}
      <ellipse cx={x} cy={y} rx={6} ry={4.4} transform={`rotate(-20 ${x} ${y})`} />
    </g>
  );
}

/** The highlight behind a notehead; each style has its own shape. */
function Halo({ style, x, y }: { style: StaffNoteStyle; x: number; y: number }) {
  const cls = `${styles.halo} ${styles[style]}`;
  if (style === 'wrong') {
    return (
      <rect
        className={cls}
        x={x - 8}
        y={y - 8}
        width={16}
        height={16}
        rx={2}
        transform={`rotate(45 ${x} ${y})`}
      />
    );
  }
  if (style === 'root') {
    return <rect className={cls} x={x - 9} y={y - 9} width={18} height={18} rx={4} />;
  }
  return <circle className={cls} cx={x} cy={y} r={style === 'correct' ? 10 : 9} />;
}

/** How soon after a pointer pick its own click arrives. */
const CLICK_AFTER_POINTER_MS = 1000;

function clamp(p: StaffPosition, range: PositionRange): StaffPosition {
  return Math.min(range[1], Math.max(range[0], p));
}

function nearest(engraved: Engraving | null, x: number): number | undefined {
  let best: number | undefined;
  engraved?.notes.forEach((n, i) => {
    if (best === undefined || Math.abs(n.x - x) < Math.abs((engraved.notes[best]?.x ?? 0) - x)) {
      best = i;
    }
  });
  return best;
}
