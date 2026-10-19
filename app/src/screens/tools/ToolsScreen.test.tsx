import { lazy } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { collectTools, type Tool } from './registry';
import { ToolScreen, ToolsScreen } from './ToolsScreen';

const tools: Tool[] = [
  {
    id: 'tuner',
    name: 'Tuner',
    purpose: 'Tune each string by ear or mic.',
    icon: '♪',
    order: 1,
    View: () => <p>Tuner view</p>,
  },
  {
    id: 'metronome',
    name: 'Metronome',
    purpose: 'Keep time with a click.',
    icon: '◷',
    order: 2,
    View: () => <p>Metronome view</p>,
  },
];

const size = { w: window.innerWidth, h: window.innerHeight };
function resize(w: number, h: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: h });
  window.dispatchEvent(new Event('resize'));
}

function renderAt(path: string, list: readonly Tool[] = tools) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/tools" element={<ToolsScreen tools={list} />} />
        <Route path="/tools/:tool" element={<ToolScreen tools={list} />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => resize(size.w, size.h));

describe('<ToolsScreen>', () => {
  it('shows a card per tool with its name, purpose and icon, as a grid on iPad', () => {
    resize(1194, 834);
    renderAt('/tools');
    expect(screen.getByRole('heading', { name: 'Tools', level: 1 })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Tools' });
    expect(list).toHaveAttribute('data-layout', 'grid');
    const cards = within(list).getAllByRole('link');
    expect(cards.map((c) => c.getAttribute('href'))).toEqual(['/tools/tuner', '/tools/metronome']);
    expect(cards[0]).toHaveTextContent('Tuner');
    expect(cards[0]).toHaveTextContent('Tune each string by ear or mic.');
    expect(cards[0]).toHaveTextContent('♪');
  });

  it('becomes a list on compact', () => {
    resize(390, 844);
    renderAt('/tools');
    expect(screen.getByRole('list', { name: 'Tools' })).toHaveAttribute('data-layout', 'list');
  });

  it('opens a tool from its card', () => {
    renderAt('/tools');
    fireEvent.click(screen.getByRole('link', { name: /Metronome/ }));
    expect(screen.getByRole('heading', { name: 'Metronome', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Metronome view')).toBeInTheDocument();
  });

  it('says so when no tools are registered', () => {
    renderAt('/tools', []);
    expect(screen.getByText('No tools yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('<ToolScreen>', () => {
  it('shows the named tool and leads back to all tools', () => {
    renderAt('/tools/tuner');
    expect(screen.getByRole('region', { name: 'Tuner' })).toHaveTextContent('Tuner view');
    fireEvent.click(screen.getByRole('link', { name: '← All tools' }));
    expect(screen.getByRole('heading', { name: 'Tools', level: 1 })).toBeInTheDocument();
  });

  it('says so for an unknown tool', () => {
    renderAt('/tools/kazoo');
    expect(screen.getByRole('heading', { name: 'Tool not found' })).toBeInTheDocument();
    expect(screen.getByText('There’s no tool called “kazoo”.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← All tools' })).toHaveAttribute('href', '/tools');
  });

  it('loads a registered tool’s view on demand, with a status meanwhile', async () => {
    const registered = collectTools(
      {
        './fake/tool.meta.ts': {
          id: 'fake',
          name: 'Fake',
          purpose: 'Test only.',
          icon: '✱',
          order: 1,
          testOnly: true,
        },
      },
      { './fake/tool.tsx': () => Promise.resolve({ View: () => <p>Fake view</p> }) },
      { includeTestOnly: true },
    );
    renderAt('/tools/fake', registered);
    expect(screen.getByRole('status')).toHaveTextContent('Loading Fake…');
    expect(await screen.findByText('Fake view')).toBeInTheDocument();
  });

  it('offers a reload when a tool fails to download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = [{ ...tools[0]!, View: lazy(() => Promise.reject(new Error('offline'))) }];
    renderAt('/tools/tuner', broken);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t load Tuner.');
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    fireEvent.click(within(alert).getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
