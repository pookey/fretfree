import { NECK_JOINT_Y, SCALE } from '../geometry';
import type { BodyShape } from '../types';

const J = NECK_JOINT_Y;

/**
 * Stratocaster: a contoured double cutaway, the bass horn longer than the
 * treble, three single coils and a tremolo. The outline is an original drawing, not a
 * trace of the product; only the name is the model's.
 */
const stratocaster: BodyShape = {
  name: 'Stratocaster',
  outline: [
    `M -28 ${J}`,
    // Bass horn: up the inside, close to the neck, to a tip leaning inwards.
    `C -38 ${J} -44 ${J - 14} -46 ${J - 34}`,
    `C -48 ${J - 56} -52 ${J - 76} -62 ${J - 84}`,
    `C -72 ${J - 92} -88 ${J - 88} -98 ${J - 74}`,
    // One long convex sweep down into the upper bout, then waist and lower bout.
    `C -112 ${J - 54} -128 ${J - 24} -140 ${J + 10}`,
    `C -152 ${J + 40} -158 ${J + 76} -152 ${J + 114}`,
    `C -148 ${J + 138} -140 ${J + 154} -143 ${J + 184}`,
    `C -147 ${J + 218} -168 ${J + 252} -165 ${J + 304}`,
    `C -163 ${J + 350} -96 ${J + 388} 0 ${J + 388}`,
    `C 96 ${J + 388} 163 ${J + 350} 165 ${J + 304}`,
    `C 168 ${J + 252} 147 ${J + 218} 143 ${J + 184}`,
    `C 140 ${J + 154} 148 ${J + 138} 152 ${J + 114}`,
    // Treble horn: shorter, so the reach to high frets is clear.
    `C 156 ${J + 72} 148 ${J + 44} 136 ${J + 22}`,
    `C 124 ${J + 2} 114 ${J - 20} 102 ${J - 36}`,
    `C 94 ${J - 48} 80 ${J - 52} 72 ${J - 42}`,
    `C 64 ${J - 32} 58 ${J - 18} 52 ${J - 8}`,
    `C 46 ${J} 38 ${J} 28 ${J}`,
    'Z',
  ].join(' '),
  pickguard: [
    `M -29 ${J}`,
    // Along the bass horn's root and the upper bout, about 15 mm in.
    `C -50 ${J - 4} -80 ${J - 8} -104 ${J + 12}`,
    `C -128 ${J + 32} -140 ${J + 72} -134 ${J + 112}`,
    `C -128 ${J + 140} -122 ${J + 165} -122 ${J + 190}`,
    `C -122 ${J + 215} -108 ${J + 238} -84 ${J + 240}`,
    // Round the top of the tremolo plate.
    `C -66 ${J + 241} -52 ${J + 236} -44 ${J + 236}`,
    `L 44 ${J + 236}`,
    // Down past the controls, round, and back up the treble side.
    `C 50 ${J + 262} 60 ${J + 302} 86 ${J + 334}`,
    `C 108 ${J + 360} 142 ${J + 352} 145 ${J + 316}`,
    `C 148 ${J + 282} 136 ${J + 250} 134 ${J + 216}`,
    `C 132 ${J + 180} 126 ${J + 160} 128 ${J + 130}`,
    `C 131 ${J + 96} 130 ${J + 62} 114 ${J + 42}`,
    `C 100 ${J + 26} 82 ${J + 12} 64 ${J + 8}`,
    `C 50 ${J + 5} 40 ${J + 1} 29 ${J}`,
    'Z',
  ].join(' '),
  pickups: [
    { type: 'single', x: 0, y: SCALE - 160 },
    { type: 'single', x: 0, y: SCALE - 100 },
    { type: 'single', x: 0, y: SCALE - 42, angle: 9 },
  ],
  bridge: { type: 'tremolo', x: 0, y: SCALE },
  controls: {
    knobs: [
      { x: 80, y: SCALE - 18 },
      { x: 98, y: SCALE + 26 },
      { x: 110, y: SCALE + 72 },
    ],
    switch: { type: 'blade', x: 74, y: SCALE - 70, angle: 30 },
    jack: { x: 126, y: SCALE + 118 },
  },
  neckJoint: { y: J },
};

export default stratocaster;
