import { Link } from 'react-router';
import { toSpendText } from './copy';
import { GARAGE_PATH } from './garage-path';

export interface GarageBalanceProps {
  toSpend: number;
  className?: string;
  /** Where the line links to; the Garage route's path by default. Plain text when null. */
  garagePath?: string | null;
}

/** "N to spend in the Garage", linking to the Garage once it exists. */
export function GarageBalance({
  toSpend,
  className,
  garagePath = GARAGE_PATH,
}: GarageBalanceProps) {
  const text = toSpendText(toSpend);
  return garagePath ? (
    <Link to={garagePath} className={className} data-testid="garage-balance">
      {text}
    </Link>
  ) : (
    <span className={className} data-testid="garage-balance">
      {text}
    </span>
  );
}
