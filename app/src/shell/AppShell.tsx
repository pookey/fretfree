import { NavLink, Outlet } from 'react-router';
import { NAV_ITEMS } from './nav';
import { useSizeClass } from './size-class';
import styles from './AppShell.module.css';

/**
 * iPad-first shell (design §7): a sidebar at regular-wide (collapsing to icons
 * at regular) and a bottom tab bar at compact.
 */
export function AppShell() {
  const sizeClass = useSizeClass();
  const compact = sizeClass === 'compact';
  return (
    <div className={styles.shell} data-size-class={sizeClass}>
      {!compact && (
        <nav className={styles.sidebar} aria-label="Sections" data-testid="sidebar">
          <div className={styles.brand}>
            <span className={styles.logo} aria-hidden>
              ♪
            </span>
            {sizeClass === 'regular-wide' && <span>Fretwork</span>}
          </div>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => (isActive ? styles.active : undefined)}
                  aria-label={item.label}
                >
                  <span className={styles.icon} aria-hidden>
                    {item.icon}
                  </span>
                  {sizeClass === 'regular-wide' && <span>{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
      <main className={styles.main}>
        <Outlet />
      </main>
      {compact && (
        <nav className={styles.tabbar} aria-label="Sections" data-testid="tabbar">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => (isActive ? styles.active : undefined)}
            >
              <span className={styles.icon} aria-hidden>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
