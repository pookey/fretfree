import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Pickguards (design §3.8): a colour, or none. */
const pickguards: readonly CatalogueItem<'pickguard'>[] = [
  {
    id: 'pickguard.white',
    category: 'pickguard',
    name: 'White',
    price: garage.prices['pickguard.white'],
    render: { colour: '#f2efe8' },
  },
];

export default pickguards;
