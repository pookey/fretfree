import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../../../app-store';
import { DEFAULT_SETTINGS } from '../../../engine/model';
import { createFakeMetronome, type FakeMetronome } from '../../../timing/fake-metronome';
import { createMetronomeController, type MetronomeController } from './controller';
import { Metronome } from './Metronome';
import { installMiniControl, MiniControl } from './MiniControl';

const size = { w: window.innerWidth, h: window.innerHeight };
function resize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

let metronome: FakeMetronome;
let controller: MetronomeController;
let path: string;

beforeEach(() => {
  metronome = createFakeMetronome();
  path = '/tools/metronome';
  controller = createMetronomeController({
    metronome,
    outputLatencyMs: () => 0,
    pathname: () => path,
    base: '/',
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id as number),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id as number),
  });
  useAppStore.setState({ settings: { ...DEFAULT_SETTINGS } });
});

afterEach(() => {
  controller.stop();
  resize(size.w, size.h);
  vi.useRealTimers();
});

const bpm = () => screen.getByTestId('metronome-bpm');
const beats = () => screen.getByTestId('metronome-beats');

async function start() {
  fireEvent.click(screen.getByRole('button', { name: 'Start' }));
  await act(async () => {});
}

/** Fires `type` on `el` with an exact `timeStamp`, which jsdom otherwise sets to now. */
function fireAt(el: Element, type: 'pointerDown' | 'click', timeStamp: number) {
  const event = createEvent[type](el);
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  fireEvent(el, event);
}

/** Sounds the next click and lets its light show (no output latency here). */
async function tick() {
  act(() => void metronome.tick());
  await act(() => new Promise((r) => setTimeout(r, 0)));
}

describe('<Metronome>', () => {
  it('starts and stops the click', async () => {
    render(<Metronome controller={controller} />);
    expect(beats()).toHaveAttribute('data-pulse', '');
    await start();
    expect(metronome.running).toBe(true);
    expect(metronome.layout).toMatchObject({ meter: { groups: [4] }, countInBars: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(metronome.running).toBe(false);
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('lights the pulse sounding, the count-in as an outline', async () => {
    render(<Metronome controller={controller} />);
    fireEvent.click(screen.getByRole('radio', { name: /3\/4/ }));
    await start();
    await tick();
    expect(beats()).toHaveAttribute('data-pulse', '0');
    expect(beats()).toHaveAttribute('data-count-in', 'true');
    expect(beats()).toHaveTextContent('Count-in');
    const cells = beats().querySelectorAll('[data-accent]');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveAttribute('data-lit', 'count-in');
    await tick();
    await tick();
    await tick();
    expect(beats()).toHaveAttribute('data-count-in', 'false');
    expect(cells[0]).toHaveAttribute('data-lit', 'on');
    expect(cells[0]).toHaveAttribute('data-accent', 'bar');
    await tick();
    expect(cells[1]).toHaveAttribute('data-lit', 'on');
    expect(cells[0]).not.toHaveAttribute('data-lit');
    expect(beats()).toHaveTextContent('2');
  });

  it('changes the tempo by slider and steps, within 30–250', async () => {
    render(<Metronome controller={controller} />);
    expect(bpm()).toHaveTextContent('100');
    fireEvent.click(screen.getByRole('button', { name: '+5 BPM' }));
    fireEvent.click(screen.getByRole('button', { name: '+1 BPM' }));
    expect(bpm()).toHaveTextContent('106');
    fireEvent.click(screen.getByRole('button', { name: '−1 BPM' }));
    fireEvent.click(screen.getByRole('button', { name: '−5 BPM' }));
    expect(bpm()).toHaveTextContent('100');

    const slider = screen.getByRole('slider', { name: 'Tempo' });
    expect(slider).toHaveAttribute('min', '30');
    expect(slider).toHaveAttribute('max', '250');
    fireEvent.change(slider, { target: { value: '250' } });
    expect(bpm()).toHaveTextContent('250');
    expect(screen.getByRole('button', { name: '+1 BPM' })).toBeDisabled();
    fireEvent.change(slider, { target: { value: '30' } });
    expect(screen.getByRole('button', { name: '−5 BPM' })).toBeDisabled();

    await start();
    fireEvent.click(screen.getByRole('button', { name: '+5 BPM' }));
    expect(metronome.tempo.at(-1)!.bpm).toBe(35);
  });

  it('sets the tempo from taps, on the pointer going down', () => {
    render(<Metronome controller={controller} />);
    const tap = screen.getByRole('button', { name: 'Tap tempo' });
    fireAt(tap, 'pointerDown', 1000);
    fireAt(tap, 'click', 1080);
    fireAt(tap, 'pointerDown', 1500);
    fireAt(tap, 'click', 1580);
    expect(bpm()).toHaveTextContent('120');
  });

  it('takes taps from the keyboard as clicks', () => {
    render(<Metronome controller={controller} />);
    const tap = screen.getByRole('button', { name: 'Tap tempo' });
    fireAt(tap, 'click', 1000);
    fireAt(tap, 'click', 1750);
    expect(bpm()).toHaveTextContent('80');
  });

  it('offers every meter preset, odd groupings included, and its accents', () => {
    render(<Metronome controller={controller} />);
    const meter = screen.getByRole('group', { name: 'Meter' });
    expect(within(meter).getAllByRole('radio')).toHaveLength(11);
    expect(within(meter).getByRole('radio', { name: '4/4' })).toBeChecked();
    const accent = screen.getByRole('group', { name: 'Accent' });
    expect(
      within(accent)
        .getAllByRole('radio')
        .map((r) => r.parentElement!.textContent),
    ).toEqual(['Downbeat', 'Every beat']);

    fireEvent.click(within(meter).getByRole('radio', { name: '7/8 (2+2+3)' }));
    expect(within(accent).getByRole('radio', { name: 'Felt beats (2+2+3)' })).toBeChecked();
    const cells = beats().querySelectorAll('[data-accent]');
    expect([...cells].map((c) => c.getAttribute('data-accent'))).toEqual([
      'bar',
      'pulse',
      'group',
      'pulse',
      'group',
      'pulse',
      'pulse',
    ]);
    expect(screen.getByText('eighth notes per minute')).toBeInTheDocument();

    fireEvent.click(within(accent).getByRole('radio', { name: 'Every beat' }));
    expect(beats().querySelectorAll('[data-accent="group"]')).toHaveLength(6);
  });

  it('starts with the chosen count-in and subdivision', async () => {
    render(<Metronome controller={controller} />);
    fireEvent.click(screen.getByRole('radio', { name: '2 bars' }));
    within(screen.getByRole('group', { name: 'Clicks per beat' }))
      .getByRole('radio', { name: '3' })
      .click();
    await start();
    expect(metronome.layout).toMatchObject({ countInBars: 2, subdivide: 3 });
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(metronome.layout).toMatchObject({ countInBars: 2 });
  });

  it('can be pinned on outside Tools', () => {
    render(<Metronome controller={controller} />);
    const pin = screen.getByRole('checkbox', { name: /Keep clicking outside Tools/ });
    expect(pin).not.toBeChecked();
    fireEvent.click(pin);
    expect(controller.getState().pinned).toBe(true);
  });

  it('says when sound is off', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, soundOn: false } });
    render(<Metronome controller={controller} />);
    expect(screen.getByRole('note')).toHaveTextContent('Sound is off in Settings');
  });

  it('puts the beat beside the settings on iPad, one column on compact', () => {
    resize(1180, 820);
    const { container, unmount } = render(<Metronome controller={controller} />);
    expect(container.firstChild).toHaveAttribute('data-layout', 'split');
    unmount();
    resize(390, 844);
    const again = render(<Metronome controller={controller} />);
    expect(again.container.firstChild).toHaveAttribute('data-layout', 'stack');
  });

  it('keeps clicking when the view closes inside Tools, and stops outside', async () => {
    const view = render(<Metronome controller={controller} />);
    await start();
    path = '/tools/tuner';
    view.unmount();
    expect(metronome.running).toBe(true);
    const again = render(<Metronome controller={controller} />);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    path = '/';
    again.unmount();
    expect(metronome.running).toBe(false);
  });
});

describe('<MiniControl>', () => {
  it('shows only while the click runs with the view closed, and stops it', async () => {
    render(<MiniControl controller={controller} />);
    expect(screen.queryByRole('region', { name: 'Metronome' })).toBeNull();
    const close = controller.openView();
    await act(() => controller.start());
    expect(screen.queryByRole('region', { name: 'Metronome' })).toBeNull();
    act(close);
    const mini = screen.getByRole('region', { name: 'Metronome' });
    expect(mini).toHaveTextContent('100 BPM');
    fireEvent.click(within(mini).getByRole('button', { name: 'Stop metronome' }));
    expect(metronome.running).toBe(false);
    expect(screen.queryByRole('region', { name: 'Metronome' })).toBeNull();
  });

  it('installs once, beside the app', async () => {
    installMiniControl(controller);
    installMiniControl(controller);
    expect(document.querySelectorAll('[data-metronome-mini]')).toHaveLength(1);
    path = '/tools';
    await act(() => controller.start());
    expect(await screen.findByRole('region', { name: 'Metronome' })).toBeInTheDocument();
  });
});
