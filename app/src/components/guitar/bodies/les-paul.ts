import { NECK_JOINT_Y, SCALE } from '../geometry';
import type { BodyShape } from '../types';

const J = NECK_JOINT_Y;

/**
 * Les Paul: a rounded bass bout, one pointed cutaway on the treble
 * side, a bound top, two humbuckers, a bar bridge with a stop tailpiece
 * and four knobs. The outline is an original drawing, not a
 * trace of the product; only the name is the model's.
 */
const lesPaul: BodyShape = {
  name: 'Les Paul',
  outline: [
    `M -28 ${J}`,
    // Bass side: one rounded upper bout, a gentle waist, a full lower bout.
    `C -56 ${J - 14} -104 ${J - 18} -128 ${J + 8}`,
    `C -150 ${J + 30} -150 ${J + 70} -138 ${J + 100}`,
    `C -130 ${J + 120} -128 ${J + 140} -138 ${J + 164}`,
    `C -150 ${J + 186} -170 ${J + 220} -170 ${J + 270}`,
    `C -170 ${J + 330} -110 ${J + 380} 0 ${J + 380}`,
    `C 110 ${J + 380} 170 ${J + 330} 170 ${J + 270}`,
    `C 170 ${J + 220} 150 ${J + 186} 138 ${J + 164}`,
    `C 128 ${J + 140} 130 ${J + 120} 136 ${J + 100}`,
    // Treble side: up into a horn leaning towards the neck, then the cutaway.
    `C 142 ${J + 80} 138 ${J + 50} 124 ${J + 28}`,
    `C 112 ${J + 10} 96 ${J - 2} 84 ${J + 4}`,
    `C 74 ${J + 10} 70 ${J + 24} 62 ${J + 34}`,
    `C 52 ${J + 46} 40 ${J + 50} 28 ${J + 50}`,
    'Z',
  ].join(' '),
  // A raised guard beside the pickups, on the treble side.
  pickguard: [
    `M 48 ${J + 64}`,
    `C 72 ${J + 52} 104 ${J + 48} 118 ${J + 70}`,
    `C 132 ${J + 92} 124 ${J + 140} 106 ${J + 176}`,
    `C 94 ${J + 200} 76 ${J + 224} 60 ${J + 226}`,
    `C 52 ${J + 227} 48 ${J + 218} 48 ${J + 206}`,
    'Z',
  ].join(' '),
  pickups: [
    { type: 'humbucker', x: 0, y: SCALE - 152 },
    { type: 'humbucker', x: 0, y: SCALE - 40 },
  ],
  bridge: { type: 'tune-o-matic', x: 0, y: SCALE },
  tailpiece: { type: 'stop', x: 0, y: SCALE + 50 },
  controls: {
    knobs: [
      { x: 86, y: SCALE + 36 },
      { x: 126, y: SCALE + 20 },
      { x: 98, y: SCALE + 82 },
      { x: 138, y: SCALE + 66 },
    ],
    switch: { type: 'toggle', x: -112, y: J + 34 },
  },
  neckJoint: { y: J },
  binding: true,
};

export default lesPaul;
