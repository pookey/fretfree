import { NECK_JOINT_Y, SCALE } from '../geometry';
import type { BodyShape } from '../types';

const J = NECK_JOINT_Y;

/**
 * Telecaster: a slab with one cutaway on the treble side, a rounded bass
 * shoulder, two single coils, a bridge plate that holds the bridge pickup
 * and a control plate. The outline is an original drawing, not a
 * trace of the product; only the name is the model's.
 */
const telecaster: BodyShape = {
  name: 'Telecaster',
  outline: [
    `M -28 ${J}`,
    // Bass side: a round shoulder, a nearly straight side.
    `C -54 ${J - 8} -96 ${J - 10} -124 ${J + 12}`,
    `C -146 ${J + 30} -150 ${J + 60} -150 ${J + 92}`,
    `C -150 ${J + 130} -145 ${J + 160} -148 ${J + 196}`,
    `C -152 ${J + 236} -165 ${J + 262} -165 ${J + 300}`,
    // A broad bottom with rounded corners.
    `C -164 ${J + 344} -130 ${J + 384} -60 ${J + 388}`,
    `C -30 ${J + 390} 30 ${J + 390} 60 ${J + 388}`,
    `C 130 ${J + 384} 164 ${J + 344} 165 ${J + 300}`,
    `C 166 ${J + 262} 152 ${J + 236} 148 ${J + 196}`,
    `C 144 ${J + 156} 146 ${J + 112} 146 ${J + 80}`,
    // The treble horn, then one long cutaway down to the end of the board.
    `C 146 ${J + 50} 140 ${J + 28} 126 ${J + 22}`,
    `C 110 ${J + 16} 96 ${J + 26} 86 ${J + 40}`,
    `C 74 ${J + 58} 54 ${J + 78} 28 ${J + 80}`,
    'Z',
  ].join(' '),
  pickguard: [
    `M -29 ${J + 2}`,
    `C -52 ${J + 4} -90 ${J + 4} -110 ${J + 22}`,
    `C -130 ${J + 40} -136 ${J + 70} -134 ${J + 100}`,
    `C -130 ${J + 130} -124 ${J + 160} -100 ${J + 174}`,
    `C -80 ${J + 184} -62 ${J + 178} -48 ${J + 176}`,
    `L 48 ${J + 176}`,
    `C 66 ${J + 176} 92 ${J + 168} 106 ${J + 146}`,
    `C 120 ${J + 124} 128 ${J + 84} 120 ${J + 56}`,
    `C 114 ${J + 40} 102 ${J + 40} 92 ${J + 52}`,
    `C 80 ${J + 68} 60 ${J + 88} 29 ${J + 90}`,
    'Z',
  ].join(' '),
  pickups: [
    { type: 'single', x: 0, y: SCALE - 160 },
    { type: 'single', x: 0, y: SCALE - 40, angle: 8 },
  ],
  bridge: { type: 'plate', x: 0, y: SCALE },
  controls: {
    plate: 'M 77.1 591.9 A 15 15 0 0 1 106.9 588.1 L 122.9 716.1 A 15 15 0 0 1 93.1 719.9 Z',
    knobs: [
      { x: 99, y: 646 },
      { x: 105, y: 694 },
    ],
    switch: { type: 'blade', x: 94, y: 606, angle: -7 },
  },
  neckJoint: { y: J },
};

export default telecaster;
