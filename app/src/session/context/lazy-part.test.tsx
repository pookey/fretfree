import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { lazyPart } from './lazy-part';

function Greeting({ name }: { name: string }) {
  return <p>Hello {name}</p>;
}

describe('lazyPart', () => {
  it('shows the fallback, then the part with its props, loading it once', async () => {
    const load = vi.fn(() => Promise.resolve(Greeting));
    const Part = lazyPart(load);
    expect(load).not.toHaveBeenCalled();
    const { rerender } = render(<Part name="Ana" fallback={<p>Loading</p>} />);
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(await screen.findByText('Hello Ana')).toBeInTheDocument();
    rerender(<Part name="Bo" />);
    expect(await screen.findByText('Hello Bo')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('drops out, leaving the rest of the panel, when its chunk fails to load', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Part = lazyPart<{ name: string }>(() => Promise.reject(new Error('offline')));
    render(
      <div>
        <h2>Panel</h2>
        <Part name="Ana" fallback={<p>Loading</p>} />
      </div>,
    );
    await vi.waitFor(() => expect(screen.queryByText('Loading')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Panel' })).toBeInTheDocument();
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
    error.mockRestore();
  });

  it('tries again when the panel next mounts it, once the network is back', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi
      .fn<() => Promise<typeof Greeting>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(Greeting);
    const Part = lazyPart(load);
    const first = render(<Part name="Ana" fallback={<p>Loading</p>} />);
    await vi.waitFor(() => expect(screen.queryByText('Loading')).not.toBeInTheDocument());
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
    first.unmount();
    render(<Part name="Ana" />);
    expect(await screen.findByText('Hello Ana')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
