import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Hardware (design §3.8): chrome, gold or black. */
const hardware: readonly CatalogueItem<'hardware'>[] = [
  {
    id: 'hardware.chrome',
    category: 'hardware',
    name: 'Chrome',
    price: garage.prices['hardware.chrome'],
    render: { colour: '#c9ccd1' },
  },
];

export default hardware;
