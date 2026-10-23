import { useId } from 'react';
import { darken, lighten, luminance } from './colour';
import { finishPaint } from './finish';
import { frameBox, frameOf, type GuitarCrop, type GuitarSize } from './frame';
import { DEFAULT_FRETS, stringWidth, stringX, tunerPost } from './geometry';
import { guitarLabel } from './label';
import { Board, Headstock, HeelShadow } from './Neck';
import {
  BridgeBase,
  BridgeTop,
  Controls,
  Pickup,
  Tailpiece,
  stringEnd,
  type Paints,
} from './parts';
import { bodyFor } from './registry';
import type { GuitarLook } from './types';

export interface GuitarProps {
  spec: GuitarLook;
  /** Height in rem, or `fill` to take the container's width. */
  size: GuitarSize;
  /** Overrides the generated accessible name. */
  label?: string;
  /** `body` frames the body only, for small avatars. */
  crop?: GuitarCrop;
  className?: string;
}

const SHADOW = 'rgba(0,0,0,0.35)';
const BINDING = '#efe3c8';

/**
 * One guitar as one SVG (design §3.8): the body in its finish, then the
 * pickguard, electronics and hardware, the neck and headstock, and the
 * strings over everything. Nothing animates.
 *
 * Mount it through `components/guitar` (`index.tsx`), which loads this
 * module lazily so it stays out of first-load JS.
 */
export function GuitarArt({ spec, size, label, crop = 'full', className }: GuitarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (part: string) => `guitar-${uid}-${part}`;
  const body = bodyFor(spec.body.render.shape);
  const frets = body.frets ?? DEFAULT_FRETS;
  const frame = frameOf(crop);
  const palette = spec.board.render.palette;
  const hardware = spec.hardware.render.colour;
  const guard = spec.pickguard.render.colour;
  const finish = finishPaint(id('finish'), spec.finish.render);
  const paints: Paints = {
    metal: `url(#${id('metal')})`,
    colour: hardware,
    plastic: guard && luminance(guard) > 0.5 ? '#f7f4ec' : '#1c1a19',
  };
  const tailY = stringEnd(body.bridge, body.tailpiece);

  return (
    <svg
      role="img"
      aria-label={label ?? guitarLabel(spec)}
      viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
      className={className}
      style={{ display: 'block', ...frameBox(size, crop) }}
    >
      <defs>
        {finish.defs}
        <linearGradient id={id('metal')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={lighten(hardware, 0.55)} />
          <stop offset="0.45" stopColor={hardware} />
          <stop offset="0.8" stopColor={darken(hardware, 0.3)} />
          <stop offset="1" stopColor={lighten(hardware, 0.2)} />
        </linearGradient>
        <radialGradient id={id('edge')} cx="0.5" cy="0.58" r="0.62">
          <stop offset="0.72" stopColor="#000" stopOpacity={0} />
          <stop offset="1" stopColor="#000" stopOpacity={0.38} />
        </radialGradient>
        <linearGradient id={id('gloss')} x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.28} />
          <stop offset="0.38" stopColor="#fff" stopOpacity={0} />
          <stop offset="0.72" stopColor="#fff" stopOpacity={0.07} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id={id('body')}>
          <path d={body.outline} />
        </clipPath>
      </defs>

      <path d={body.outline} transform="translate(5 8)" fill="#000" opacity={0.25} />
      <path d={body.outline} fill={finish.paint} />
      <path d={body.outline} fill={`url(#${id('edge')})`} />
      {body.binding && (
        <path
          d={body.outline}
          fill="none"
          stroke={BINDING}
          strokeWidth={7}
          clipPath={`url(#${id('body')})`}
        />
      )}
      <path
        d={body.outline}
        fill="none"
        stroke={darken(spec.finish.render.stops[0]?.colour ?? '#888', 0.55)}
        strokeWidth={1.5}
      />
      {body.details?.map((d, i) => (
        <path
          key={i}
          d={d.d}
          fill={d.paint === 'hole' ? '#110d0b' : 'none'}
          stroke={d.paint === 'trim' ? BINDING : SHADOW}
          strokeWidth={d.paint === 'trim' ? 2.5 : 1}
        />
      ))}

      {guard && body.pickguard && (
        <g>
          <path d={body.pickguard} transform="translate(2 3)" fill="#000" opacity={0.3} />
          <path d={body.pickguard} fill={guard} />
          <path d={body.pickguard} fill="none" stroke={darken(guard, 0.3)} strokeWidth={1.2} />
        </g>
      )}

      <g clipPath={`url(#${id('body')})`}>
        <HeelShadow frets={frets} from={body.neckJoint.y} />
      </g>
      <BridgeBase at={body.bridge} paints={paints} />
      {body.pickups.map((p) => (
        <Pickup key={`${p.x},${p.y}`} at={p} paints={paints} />
      ))}
      <BridgeTop at={body.bridge} paints={paints} />
      {body.tailpiece && <Tailpiece at={body.tailpiece} paints={paints} />}
      <Controls at={body.controls} paints={paints} />
      <path d={body.outline} fill={`url(#${id('gloss')})`} pointerEvents="none" />

      <Board palette={palette} inlay={spec.inlay.render.shape} frets={frets} />
      <Headstock palette={palette} paints={paints} />

      {[1, 2, 3, 4, 5, 6].map((s) => {
        const post = tunerPost(s);
        const d = `M ${post.x} ${post.y} L ${stringX(s, 0)} 0 L ${stringX(s, tailY)} ${tailY}`;
        return (
          <g key={s} fill="none" strokeLinejoin="round">
            <path d={d} stroke="#000" strokeOpacity={0.35} strokeWidth={stringWidth(s) + 0.9} />
            <path d={d} stroke={palette['--string']} strokeWidth={stringWidth(s)} />
          </g>
        );
      })}
    </svg>
  );
}
