import { garage } from '../../config/garage';
import type { CatalogueItem } from '../types';

/** Pickguards (design §3.8): a colour, or none. */
const pickguard = (
  slug: string,
  name: string,
  colour: string | null,
): CatalogueItem<'pickguard'> => ({
  id: `pickguard.${slug}`,
  category: 'pickguard',
  name,
  price: garage.prices[`pickguard.${slug}`],
  render: { colour },
});

const pickguards: readonly CatalogueItem<'pickguard'>[] = [
  pickguard('white', 'White', '#f2efe8'),
  pickguard('none', 'None', null),
  pickguard('black', 'Black', '#1a1a1d'),
  pickguard('cream', 'Cream', '#efe2bf'),
  pickguard('mint', 'Mint', '#d6e8d4'),
  pickguard('tortoiseshell', 'Tortoiseshell', '#6a2e17'),
];

export default pickguards;
