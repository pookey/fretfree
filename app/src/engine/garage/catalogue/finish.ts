import { garage } from '../../config/garage';
import type { CatalogueItem, ColourStop, FinishType } from '../types';

/**
 * Finishes (design §3.8): solid, sunburst, natural, metallic and sparkle.
 * Stops run from the centre of the body (or the gradient's start) at 0 to its
 * edge at 1. A sunburst is radial; a natural finish is its wood and grain; a
 * sparkle finish is its base and flake colours.
 */
const priced = (
  slug: string,
  name: string,
  type: FinishType,
  stops: readonly ColourStop[],
): CatalogueItem<'finish'> => ({
  id: `finish.${slug}`,
  category: 'finish',
  name,
  price: garage.prices[`finish.${slug}`],
  render: { type, stops },
});

/**
 * A mastery finish: never sold, owned the moment its badge unlocks. Only
 * mastery, speed and mic badges qualify, never a streak (design §3.8).
 */
const mastery = (
  slug: string,
  name: string,
  unlockedBy: string,
  type: FinishType,
  stops: readonly ColourStop[],
): CatalogueItem<'finish'> => ({
  id: `finish.${slug}`,
  category: 'finish',
  name,
  unlockedBy,
  render: { type, stops },
});

const solid = (colour: string): ColourStop[] => [{ offset: 0, colour }];

const finishes: readonly CatalogueItem<'finish'>[] = [
  priced('red', 'Red', 'solid', solid('#b3262d')),
  priced('black', 'Black', 'solid', solid('#16161a')),
  priced('white', 'White', 'solid', solid('#ece8de')),
  priced('blue', 'Blue', 'solid', solid('#2b5fa8')),
  priced('seafoam', 'Seafoam', 'solid', solid('#8fc9b0')),

  priced('three-tone-sunburst', 'Three-tone sunburst', 'sunburst', [
    { offset: 0, colour: '#e8b23a' },
    { offset: 0.55, colour: '#b0471c' },
    { offset: 1, colour: '#1e120c' },
  ]),
  priced('cherry-sunburst', 'Cherry sunburst', 'sunburst', [
    { offset: 0, colour: '#e3a64a' },
    { offset: 0.6, colour: '#a8182a' },
    { offset: 1, colour: '#4a0b14' },
  ]),
  priced('tobacco-burst', 'Tobacco burst', 'sunburst', [
    { offset: 0, colour: '#c98b3e' },
    { offset: 0.6, colour: '#6b3a1a' },
    { offset: 1, colour: '#1b100a' },
  ]),

  priced('natural-ash', 'Natural ash', 'natural', [
    { offset: 0, colour: '#e3cfa6' },
    { offset: 1, colour: '#b99a6a' },
  ]),
  priced('butterscotch', 'Butterscotch', 'natural', [
    { offset: 0, colour: '#e6b866' },
    { offset: 1, colour: '#b9813a' },
  ]),
  priced('mahogany', 'Mahogany', 'natural', [
    { offset: 0, colour: '#8a3f22' },
    { offset: 1, colour: '#5a2614' },
  ]),
  priced('walnut', 'Walnut', 'natural', [
    { offset: 0, colour: '#6b4a32' },
    { offset: 1, colour: '#3e2a1c' },
  ]),

  priced('silver-metallic', 'Silver metallic', 'metallic', [
    { offset: 0, colour: '#e4e6ea' },
    { offset: 0.5, colour: '#a9adb5' },
    { offset: 1, colour: '#6d727b' },
  ]),
  priced('gold-top', 'Gold top', 'metallic', [
    { offset: 0, colour: '#f0d27a' },
    { offset: 0.5, colour: '#c9a43f' },
    { offset: 1, colour: '#8a6b1f' },
  ]),
  priced('candy-red', 'Candy red', 'metallic', [
    { offset: 0, colour: '#e0414a' },
    { offset: 0.5, colour: '#a3121e' },
    { offset: 1, colour: '#5c0810' },
  ]),

  priced('silver-sparkle', 'Silver sparkle', 'sparkle', [
    { offset: 0, colour: '#9ea3ab' },
    { offset: 1, colour: '#f4f6f8' },
  ]),
  priced('purple-sparkle', 'Purple sparkle', 'sparkle', [
    { offset: 0, colour: '#4b2370' },
    { offset: 1, colour: '#c9a6ef' },
  ]),

  mastery('gold-leaf', 'Gold leaf', 'whole-neck', 'metallic', [
    { offset: 0, colour: '#fbe7a1' },
    { offset: 0.45, colour: '#d9ae3c' },
    { offset: 1, colour: '#9a7215' },
  ]),
  mastery('lightning-sparkle', 'Lightning sparkle', 'speed-demon', 'sparkle', [
    { offset: 0, colour: '#123a7a' },
    { offset: 1, colour: '#9fd8ff' },
  ]),
  mastery('ember-burst', 'Ember burst', 'string-6-master', 'sunburst', [
    { offset: 0, colour: '#ffcf5a' },
    { offset: 0.55, colour: '#e0521c' },
    { offset: 1, colour: '#3a0d06' },
  ]),
  mastery('ice-burst', 'Ice burst', 'string-1-master', 'sunburst', [
    { offset: 0, colour: '#f2fbff' },
    { offset: 0.55, colour: '#6fb7dd' },
    { offset: 1, colour: '#0d2f4a' },
  ]),
  mastery('moon-pearl', 'Moon pearl', 'mic-notes', 'metallic', [
    { offset: 0, colour: '#fbf8f2' },
    { offset: 0.5, colour: '#dcd6e6' },
    { offset: 1, colour: '#a59fb6' },
  ]),
  mastery('aurora-sparkle', 'Aurora sparkle', 'mic-sequences', 'sparkle', [
    { offset: 0, colour: '#0f3b3a' },
    { offset: 0.5, colour: '#3fd1a0' },
    { offset: 1, colour: '#c58cf0' },
  ]),
];

export default finishes;
