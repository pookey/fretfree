import { Guitar, type GuitarLook } from '../../components/guitar';
import type { CatalogueItem, InlayShape } from '../../engine/garage';
import { finishBackground, metalBackground } from './swatch';
import styles from './Garage.module.css';

/**
 * A swatch's picture of its part. A body is drawn as that body in the
 * finish being previewed; inlays sit on the board being previewed. Purely
 * decorative: the swatch's text names the part.
 */
export function PartChip({ item, look }: { item: CatalogueItem; look: GuitarLook }) {
  switch (item.category) {
    case 'body':
      return (
        <span className={styles.bodyChip} aria-hidden>
          <Guitar spec={{ ...look, body: item }} size={4.25} crop="body" label="" />
        </span>
      );
    case 'finish':
      return (
        <span
          className={styles.roundChip}
          style={{ background: finishBackground(item.render) }}
          aria-hidden
        />
      );
    case 'hardware':
      return (
        <span
          className={styles.roundChip}
          style={{ background: metalBackground(item.render.colour) }}
          aria-hidden
        />
      );
    case 'pickguard':
      return item.render.colour === null ? (
        <span className={`${styles.guardChip} ${styles.noneChip}`} aria-hidden />
      ) : (
        <span className={styles.guardChip} style={{ background: item.render.colour }} aria-hidden />
      );
    case 'board':
      return <BoardChip palette={item.render.palette} shape={look.inlay.render.shape} />;
    case 'inlay':
      return <BoardChip palette={look.board.render.palette} shape={item.render.shape} />;
  }
}

/** A short length of fretboard: two fret wires, strings and one inlay. */
function BoardChip({
  palette,
  shape,
}: {
  palette: GuitarLook['board']['render']['palette'];
  shape: InlayShape;
}) {
  return (
    <svg className={styles.boardChip} viewBox="0 0 40 56" aria-hidden>
      <rect x="2" y="0" width="36" height="56" rx="3" fill={palette['--wood']} />
      <rect x="2" y="2" width="36" height="2.5" fill={palette['--fret-wire']} />
      <rect x="2" y="51.5" width="36" height="2.5" fill={palette['--fret-wire']} />
      <InlayMark shape={shape} fill={palette['--inlay']} />
      {[7, 12.2, 17.4, 22.6, 27.8, 33].map((x) => (
        <rect key={x} x={x - 0.4} y="0" width="0.8" height="56" fill={palette['--string']} />
      ))}
    </svg>
  );
}

function InlayMark({ shape, fill }: { shape: InlayShape; fill: string }) {
  switch (shape) {
    case 'dots':
      return <circle cx="20" cy="28" r="5" fill={fill} />;
    case 'blocks':
      return <rect x="7" y="18" width="26" height="20" rx="1" fill={fill} />;
    case 'trapezoids':
      return <path d="M9 18 H31 L34 38 H6 Z" fill={fill} />;
  }
}
