import { Component, Suspense, lazy, type ComponentType, type FC, type ReactNode } from 'react';

/** What a lazily loaded panel part draws while its chunk downloads. */
export interface LazyPartProps {
  fallback?: ReactNode;
}

/**
 * A piece of a drill's context panel that loads on first render (design §7
 * session context panel). Drills and the session are first-load JS, so heavy
 * panel parts (the chord diagram, the CAGED mini-map, which reuses the Explore
 * visualiser) stay out of that budget (design §10). The service worker
 * precaches every chunk, so this only waits on the first visit online.
 */
export function lazyPart<P extends object>(
  load: () => Promise<ComponentType<P>>,
): FC<P & LazyPartProps> {
  const Lazy = lazy(() => load().then((c) => ({ default: c })));
  function Part({ fallback = null, ...props }: P & LazyPartProps) {
    return (
      <PartBoundary>
        <Suspense fallback={fallback}>
          <Lazy {...(props as unknown as P)} />
        </Suspense>
      </PartBoundary>
    );
  }
  return Part;
}

/**
 * A part whose chunk failed to download (offline before the service worker
 * cached it) drops out. The panel is help, so the drill carries on without it.
 */
class PartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
