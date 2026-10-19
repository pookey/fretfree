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
  const make = () => lazy(() => load().then((c) => ({ default: c })));
  // React.lazy keeps a failed import for good, so a failure swaps in a fresh
  // one: the part tries again the next time the panel mounts it.
  let Lazy = make();
  const retry = () => {
    Lazy = make();
  };
  function Part({ fallback = null, ...props }: P & LazyPartProps) {
    return (
      <PartBoundary onFail={retry}>
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
class PartBoundary extends Component<
  { onFail: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch() {
    this.props.onFail();
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
