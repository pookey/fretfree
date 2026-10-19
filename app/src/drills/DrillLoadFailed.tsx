import { Component, type ReactNode } from 'react';

interface Props {
  /** The drill's title, for the message. */
  title: string;
  /** Classes for the message and its button, from the screen that shows them. */
  className?: string;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * Catches a drill view whose chunk failed to download (offline before the
 * service worker cached it), wherever a drill is rendered. A failed lazy
 * import stays failed, so the way back is a reload. Key it by drill so the
 * next drill gets a fresh try.
 */
export class DrillLoadFailed extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className={this.props.className}>
        <p>Couldn’t load {this.props.title}. Check your connection, then reload.</p>
        <button
          type="button"
          className={this.props.buttonClassName}
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
