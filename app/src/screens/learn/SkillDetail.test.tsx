import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { getSkill, type Skill, type SkillStatus } from '../../engine';
import { loadOutcomes } from '../../learn/outcomes/lazy';
import { loadWorkedExamples } from '../../learn/worked-examples/lazy';
import { SkillDetail } from './SkillDetail';
import type { SkillView } from './map-model';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

function view(skill: Skill, status: SkillStatus, practisable: boolean): SkillView {
  return {
    skill,
    status,
    itemCount: 10,
    learningCount: 6,
    stableCount: 2,
    learning: 0.6,
    mastery: 0.2,
    practisable,
  };
}

function renderSkill(id: string, status: SkillStatus, practisable = true) {
  return render(
    <MemoryRouter>
      <ul>
        <SkillDetail view={view(getSkill(id)!, status, practisable)} />
      </ul>
    </MemoryRouter>,
  );
}

describe('<SkillDetail>', () => {
  it('opens the worked example and offers focused practice on the frontier', async () => {
    renderSkill('F2.string6-naturals', 'unlocked');
    expect(
      screen.getByText('Its new cards join your daily sessions, a few each day.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practise this now' })).toHaveAttribute(
      'href',
      '/session?skill=F2.string6-naturals',
    );
    // The examples load on demand, so the toggle appears once they have.
    const toggle = await screen.findByRole('button', { name: 'Worked example' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('worked-example')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveTextContent('Hide worked example');
    const example = screen.getByTestId('worked-example');
    expect(toggle).toHaveAttribute('aria-controls', example.parentElement!.id);
    expect(example).toHaveTextContent('Landmarks on string 6');
    fireEvent.click(toggle);
    expect(screen.queryByTestId('worked-example')).toBeNull();
  });

  it('previews a locked skill’s example without offering practice (gating stays on)', async () => {
    renderSkill('C2.all-notes', 'locked');
    expect(screen.getByText(/Preview only/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Practise this now' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Worked example' }));
    expect(screen.getByTestId('worked-example')).toHaveTextContent('Octaves across the G–B shift');
  });

  it('shows neither action for a mastered skill with no example', async () => {
    await loadWorkedExamples();
    renderSkill('C1.double-octaves', 'mastered');
    expect(screen.getByText('Mastered. Reviews keep it fresh.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('offers practice without an example', async () => {
    await loadWorkedExamples();
    renderSkill('C1.double-octaves', 'practising');
    expect(screen.queryByRole('button', { name: 'Worked example' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Practise this now' })).toBeInTheDocument();
  });

  it('reads learning and stable counts, never "learned"', () => {
    renderSkill('F2.string6-naturals', 'practising');
    expect(screen.getByTestId('skill-progress')).toHaveTextContent('6 learning · 2 stable of 10');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Natural notes on string 6: 60% learning, 20% stable',
    );
    expect(screen.queryByText(/learned/i)).toBeNull();
  });

  it('offers no practice for a skill no built drill can test', () => {
    renderSkill('F3.markers', 'unlocked', false);
    expect(screen.getByText(/Coming soon\. Its drill isn't built yet/)).toBeInTheDocument();
    expect(screen.queryByText(/Its new cards join your daily sessions/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Practise this now' })).toBeNull();
  });

  it('names what a locked skill waits for, one prerequisite per line (M1-38)', () => {
    renderSkill('C3.thirds', 'locked');
    expect(
      screen.getByText("Preview only. It joins your sessions once you're practising:"),
    ).toBeInTheDocument();
    const needs = screen.getByRole('list', { name: 'Prerequisites' });
    // Titles with their own "and" stay apart instead of running together.
    expect(
      within(needs)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Half steps: sharps and flats', 'Whole steps', 'Octave shapes']);
  });

  it('names a single prerequisite inline, practising or mastered', () => {
    const { unmount } = renderSkill('C3.fourths-fifths', 'locked');
    expect(
      screen.getByText(
        "Preview only. It joins your sessions once you're practising Interval shapes: 3rds.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Prerequisites' })).toBeNull();
    unmount();
    const hard = { ...getSkill('C3.fourths-fifths')!, softUnlock: false };
    render(
      <MemoryRouter>
        <ul>
          <SkillDetail view={view(hard, 'locked', true)} />
        </ul>
      </MemoryRouter>,
    );
    expect(
      screen.getByText(
        "Preview only. It joins your sessions once you've mastered Interval shapes: 3rds.",
      ),
    ).toBeInTheDocument();
  });

  describe('a gate that mixes mastered and practising (M10-01)', () => {
    const renderGate = (prerequisites: string[], softPrerequisites: string[]) => {
      const skill = {
        ...getSkill('C3.sixths')!,
        softUnlock: false,
        prerequisites,
        softPrerequisites,
      };
      return render(
        <MemoryRouter>
          <ul>
            <SkillDetail view={view(skill, 'locked', true)} />
          </ul>
        </MemoryRouter>,
      );
    };
    const items = (name: string) =>
      within(screen.getByRole('list', { name }))
        .getAllByRole('listitem')
        .map((li) => li.textContent);

    it('names one of each in a single sentence', () => {
      renderGate(['C3.thirds'], ['C1.octaves']);
      expect(
        screen.getByText(
          "Preview only. It joins your sessions once you've mastered Interval shapes: 3rds and are practising Octave shapes.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('list', { name: /^Prerequisites/ })).toBeNull();
    });

    it('lists each kind one per line when either has more than one', () => {
      renderGate(['C3.thirds', 'C3.fourths-fifths'], ['C1.octaves']);
      expect(
        screen.getByText("Preview only. It joins your sessions once you've mastered:"),
      ).toBeInTheDocument();
      expect(screen.getByText('and are practising:')).toBeInTheDocument();
      expect(items('Prerequisites to master')).toEqual([
        'Interval shapes: 3rds',
        'Interval shapes: 4ths, 5ths and the tritone',
      ]);
      expect(items('Prerequisites to practise')).toEqual(['Octave shapes']);
    });

    it('reads as a soft gate when every prerequisite is soft', () => {
      renderGate([], ['C3.thirds']);
      expect(
        screen.getByText(
          "Preview only. It joins your sessions once you're practising Interval shapes: 3rds.",
        ),
      ).toBeInTheDocument();
    });
  });

  describe('outcomes (M10-07)', () => {
    const renderView = (skill: Skill, status: SkillStatus) =>
      render(
        <MemoryRouter>
          <ul>
            <SkillDetail view={view(skill, status, true)} />
          </ul>
        </MemoryRouter>,
      );

    it('says what a locked skill lets you do, under its title', async () => {
      renderSkill('C3.thirds', 'locked');
      const outcome = await screen.findByTestId('skill-outcome');
      expect(outcome).toHaveTextContent(/^See a major or minor 3rd as a shape from any root/);
      // Right under the title, before the status line.
      expect(
        screen.getByRole('heading', { name: 'Interval shapes: 3rds' }).nextElementSibling,
      ).toBe(outcome);
      expect(screen.getByText(/^Locked: preview ·/)).toBeInTheDocument();
    });

    it('shows no raw topic code', async () => {
      renderSkill('F2.string6-naturals', 'practising');
      await screen.findByTestId('skill-outcome');
      expect(screen.queryByText('F2')).toBeNull();
      expect(screen.getByText(/^Practising ·/)).toBeInTheDocument();
    });

    it('reads just "Locked" when a skill has nothing to preview', async () => {
      await Promise.all([loadOutcomes(), loadWorkedExamples()]);
      const bare: Skill = { ...getSkill('F3.markers')!, id: 'X.none', topic: 'X', title: 'Bare' };
      renderView(bare, 'locked');
      expect(screen.queryByTestId('skill-outcome')).toBeNull();
      expect(screen.getByText(/^Locked ·/)).toBeInTheDocument();
      expect(screen.queryByText(/Locked: preview/)).toBeNull();
    });

    it('keeps the preview label for a skill with only a worked example', async () => {
      await Promise.all([loadOutcomes(), loadWorkedExamples()]);
      // A new C6 skill: no outcome of its own, but C6's topic example covers it.
      const exampleOnly: Skill = { ...getSkill('C6.major-shapes')!, id: 'C6.new', title: 'New' };
      renderView(exampleOnly, 'locked');
      expect(screen.queryByTestId('skill-outcome')).toBeNull();
      expect(screen.getByText(/^Locked: preview ·/)).toBeInTheDocument();
    });
  });

  it('lists no prerequisites outside the locked state', () => {
    renderSkill('C3.thirds', 'unlocked');
    expect(screen.queryByRole('list', { name: 'Prerequisites' })).toBeNull();
  });
});
