import { useMemo } from 'react';
import type { MarkerStyle } from '../../components/fretboard/Fretboard';
import type { Handedness } from '../../engine/model';
import { cagedContent, chainMarkers, chainRange } from '../../screens/explore/views/caged';
import {
  chromaOf,
  type AccidentalPref,
  type CagedQuality,
  type CagedShapeName,
} from '../../theory';
import { MAP_BAND_H, cagedMapLayout, fretsText, placeCurrent } from './caged-map';
import styles from './CagedChainMap.module.css';

export interface CagedChainMapProps {
  /** The chord's root, e.g. `C`, `F#`. */
  root: string;
  quality: CagedQuality;
  /** The shape on the neck: its band is marked. */
  current: CagedShapeName;
  /**
   * The fret of the current shape's root on its root string, as on the neck.
   * The map draws that shape there, at whichever octave the drill placed it.
   */
  currentRootFret?: number;
  accidentalPref?: AccidentalPref;
  handedness?: Handedness;
}

/** Dot size on the mini-map: big enough to tell the marker shapes apart. */
const R = 3.2;

function Dot({ style, x, y }: { style: MarkerStyle; x: number; y: number }) {
  const cls = styles[style];
  if (style === 'root')
    return <rect className={cls} x={x - R} y={y - R} width={2 * R} height={2 * R} rx={1} />;
  if (style === 'fifth')
    return (
      <polygon
        className={cls}
        points={`${x},${y - R * 1.2} ${x + R * 1.2},${y + R} ${x - R * 1.2},${y + R}`}
      />
    );
  if (style === 'seventh')
    return (
      <polygon
        className={cls}
        points={[0, 60, 120, 180, 240, 300]
          .map((deg) => {
            const a = (deg * Math.PI) / 180;
            return `${(x + R * 1.1 * Math.cos(a)).toFixed(1)},${(y + R * 1.1 * Math.sin(a)).toFixed(1)}`;
          })
          .join(' ')}
      />
    );
  return <circle className={cls} cx={x} cy={y} r={style === 'ghost' ? R - 0.8 : R} />;
}

/**
 * The CAGED chain mini-map for the session's context panel (design §7): a
 * chord's five shapes as bands over a small whole neck, the current one
 * marked, with each shape's notes in the chord-tone marker shapes. Built from
 * the Explore visualiser's chain (`cagedContent`, `chainMarkers`,
 * `chainRange`), so both draw the same chain. Display only: no hit targets.
 * Standard tuning, as the visualiser.
 *
 * It shows where every shape sits, so it answers "which comes next?" (D10)
 * and "where does this shape go?" (D9). Callers show it only once that
 * answer is no longer being asked for (research/02 rule 4).
 */
export function CagedChainMap({
  root,
  quality,
  current,
  currentRootFret,
  accidentalPref = 'sharp',
  handedness = 'right',
}: CagedChainMapProps) {
  const content = useMemo(
    () =>
      placeCurrent(cagedContent(chromaOf(root), quality, accidentalPref), current, currentRootFret),
    [root, quality, accidentalPref, current, currentRootFret],
  );
  const range = chainRange(content);
  const markers = useMemo(() => chainMarkers(content, null, 'degrees'), [content]);
  const map = cagedMapLayout({
    range,
    spans: content.chain.map((l) => ({ shape: l.shape.shape, span: l.span })),
    current,
    strings: 6,
    handedness,
  });
  const label = `CAGED chain of ${content.name}: ${content.chain
    .map((l) => `${l.shape.shape} shape ${fretsText(l.span)}`)
    .join(', ')}. The ${current} shape is marked.`;

  return (
    <svg
      className={styles.map}
      viewBox={`0 0 ${map.width} ${map.height}`}
      role="img"
      aria-label={label}
      data-testid="caged-chain-map"
    >
      {map.bands
        .filter((b) => b.current)
        .map((b) => (
          <rect
            key="spot"
            className={styles.spot}
            x={b.x}
            y={map.neckTop - 3}
            width={b.width}
            height={map.neckBottom - map.neckTop + 6}
            rx={2}
          />
        ))}
      {map.nutX !== null && (
        <line
          className={styles.nut}
          x1={map.nutX}
          x2={map.nutX}
          y1={map.neckTop}
          y2={map.neckBottom}
        />
      )}
      {map.wires.map((x) => (
        <line key={x} className={styles.wire} x1={x} x2={x} y1={map.neckTop} y2={map.neckBottom} />
      ))}
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line
          key={s}
          className={styles.string}
          x1={0}
          x2={map.width}
          y1={map.stringY(s)}
          y2={map.stringY(s)}
        />
      ))}
      {markers.map((m) => (
        <Dot
          key={`${m.string}:${m.fret}`}
          style={m.style}
          x={map.fretX(m.fret)}
          y={map.stringY(m.string)}
        />
      ))}
      {map.bands.map((b) => (
        <g
          key={b.shape}
          className={styles.band}
          data-current={b.current ? 'true' : undefined}
          data-shape={b.shape}
        >
          <rect x={b.x + 1} y={b.y + 1} width={b.width - 2} height={MAP_BAND_H - 2} rx={3} />
          <text x={b.x + b.width / 2} y={b.y + MAP_BAND_H / 2} dy="0.35em">
            {b.shape}
          </text>
        </g>
      ))}
    </svg>
  );
}
