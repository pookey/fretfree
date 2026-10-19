import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../../app-store';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { createFakePitchSource, type FakePitchSource } from '../../mic';
import { getDb, getSettings } from '../../storage';
import type { Tool } from '../tools/registry';
import { MicSettings } from './MicSettings';

let source: FakePitchSource;

beforeEach(async () => {
  await getDb().settings.clear();
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: true });
  source = createFakePitchSource();
});

const tuner: Tool = {
  id: 'tuner',
  order: 10,
  name: 'Tuner',
  purpose: 'Tune up',
  icon: '♪',
  View: () => null,
};

function renderCard(tools: readonly Tool[] = []) {
  render(
    <MemoryRouter>
      <MicSettings source={source} tools={tools} />
    </MemoryRouter>,
  );
  return within(screen.getByRole('group', { name: 'Mic mode' }));
}

const toggle = (card: ReturnType<typeof renderCard>) =>
  card.getByRole('checkbox', { name: 'Mic mode' });

describe('<MicSettings>', () => {
  it('is off by default and asks for nothing until switched on', () => {
    const card = renderCard();
    expect(toggle(card)).not.toBeChecked();
    expect(toggle(card)).toHaveAccessibleDescription(/no sound leaves this device/);
    expect(card.queryByRole('button', { name: 'Check the microphone' })).toBeNull();
    expect(source.startCalls).toBe(0);
  });

  it('switching on asks from the tap, then saves and shows the check', async () => {
    const card = renderCard();
    fireEvent.click(toggle(card));
    expect(source.startCalls).toBe(1);
    await waitFor(() => expect(toggle(card)).toBeChecked());
    expect((await getSettings(getDb())).micEnabled).toBe(true);
    act(() => source.play('E2'));
    expect(card.getByTestId('mic-status')).toHaveTextContent('Mic is working. Heard E2.');

    fireEvent.click(card.getByRole('button', { name: 'Stop listening' }));
    expect(source.state).toBe('idle');
    expect(toggle(card)).toBeChecked();
  });

  it('a refusal leaves it off and says why', async () => {
    const card = renderCard();
    source.failNextStart('denied');
    fireEvent.click(toggle(card));
    expect(await card.findByRole('alert')).toHaveTextContent(/access was refused/);
    expect(toggle(card)).not.toBeChecked();
    expect((await getSettings(getDb())).micEnabled).toBe(false);
  });

  it('switching off saves at once and releases the mic', async () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, micEnabled: true } });
    const card = renderCard();
    fireEvent.click(card.getByRole('button', { name: 'Check the microphone' }));
    await waitFor(() => expect(source.state).toBe('running'));
    fireEvent.click(toggle(card));
    await waitFor(() => expect(toggle(card)).not.toBeChecked());
    expect(source.state).toBe('idle');
    expect((await getSettings(getDb())).micEnabled).toBe(false);
  });

  it('links to the tuner only once that tool is registered', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, micEnabled: true } });
    const card = renderCard([tuner]);
    expect(card.getByRole('link', { name: 'Open the tuner' })).toHaveAttribute(
      'href',
      '/tools/tuner',
    );
  });

  it('has no tuner link without the tool', () => {
    useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, micEnabled: true } });
    const card = renderCard();
    expect(card.queryByRole('link', { name: 'Open the tuner' })).toBeNull();
  });
});
