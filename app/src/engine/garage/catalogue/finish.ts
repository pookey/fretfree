import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Finishes (design §3.8): solid, sunburst, natural, metallic and sparkle. */
const finishes: readonly CatalogueItem<'finish'>[] = [
  {
    id: 'finish.red',
    category: 'finish',
    name: 'Red',
    price: garage.prices['finish.red'],
    render: { type: 'solid', stops: [{ offset: 0, colour: '#b3262d' }] },
  },
];

export default finishes;
