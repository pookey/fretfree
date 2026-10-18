import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { getSkill, type Skill, type SkillStatus } from '../../engine';
import { SkillDetail } from './SkillDetail';
import type { SkillView } from './map-model';

vi.mock('../../audio/audio', () => ({ playNotes: vi.fn(() => Promise.resolve()) }));

function view(skill: Skill, status: SkillStatus): SkillView {
  return { skill, status, itemCount: 10, stableCount: 2, mastery: 0.2 };
}

function renderSkill(id: string, status: SkillStatus) {
  return render(
    <MemoryRouter>
      <ul>
        <SkillDetail view={view(getSkill(id)!, status)} />
      </ul>
    </MemoryRouter>,
  );
}

describe('<SkillDetail>', () => {
  it('opens the worked example and offers focused practice on the frontier', () => {
    renderSkill('F2.string6-naturals', 'unlocked');
    expect(screen.getByText('Its new items join your daily sessions.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Practise this now' })).toHaveAttribute(
      'href',
      '/session?skill=F2.string6-naturals',
    );
    const toggle = screen.getByRole('button', { name: 'Worked example' });
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

  it('previews a locked skill’s example without offering practice (gating stays on)', () => {
    renderSkill('C2.all-notes', 'locked');
    expect(screen.getByText(/Preview only/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Practise this now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Worked example' }));
    expect(screen.getByTestId('worked-example')).toHaveTextContent('Octaves across the G–B shift');
  });

  it('shows neither action for a mastered skill with no example', () => {
    renderSkill('F3.markers', 'mastered');
    expect(screen.getByText('Mastered. Reviews keep it fresh.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('offers practice without an example', () => {
    renderSkill('F3.markers', 'practising');
    expect(screen.queryByRole('button', { name: 'Worked example' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Practise this now' })).toBeInTheDocument();
  });

  it('names what a locked skill waits for', () => {
    renderSkill('C2.all-notes', 'locked');
    expect(
      screen.getByText(
        /once you're practising Natural notes on string 6 and Natural notes on string 5/,
      ),
    ).toBeInTheDocument();
  });
});
