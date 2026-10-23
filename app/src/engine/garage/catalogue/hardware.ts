import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Hardware (design §3.8): chrome, gold or black. */
const part = (slug: string, name: string, colour: string): CatalogueItem<'hardware'> => ({
  id: `hardware.${slug}`,
  category: 'hardware',
  name,
  price: garage.prices[`hardware.${slug}`],
  render: { colour },
});

const hardware: readonly CatalogueItem<'hardware'>[] = [
  part('chrome', 'Chrome', '#c9ccd1'),
  part('black', 'Black', '#2a2a2e'),
  part('gold', 'Gold', '#d4af37'),
];

export default hardware;
