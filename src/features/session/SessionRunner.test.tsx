import { describe, expect, it, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { SessionPlan } from '../../types/domain';
import { WORD_MAP } from '../../data/words';
import { useProgress } from '../../store/progress';
import { useSessionPersist } from '../../store/session';
import { SessionRunner } from './SessionRunner';

const achieve = WORD_MAP['achieve']!;

function plan(): SessionPlan {
  return {
    id: 'test-plan',
    createdAt: Date.now(),
    seed: 1,
    items: [
      {
        wordId: 'achieve', activity: 'meet', dimension: 'recognition', difficulty: 1,
        reason: { kind: 'new-introduction', humanText: 'New word — Stage 1.' },
      },
      {
        wordId: 'achieve', activity: 'mcq-word-meaning', dimension: 'recognition', difficulty: 2,
        options: [achieve.shortDefinition!, 'a wrong meaning one', 'a wrong meaning two', 'a wrong meaning three'],
        answer: achieve.shortDefinition!,
        prompt: achieve.word,
        reason: { kind: 'new-introduction', humanText: 'First recognition check.' },
      },
    ],
  };
}

function renderRunner() {
  return render(
    <MemoryRouter>
      <SessionRunner plan={plan()} />
    </MemoryRouter>,
  );
}

describe('SessionRunner', () => {
  beforeEach(() => {
    useProgress.getState().resetProgress();
    useSessionPersist.getState().clear();
    localStorage.clear();
  });

  it('runs meet → mcq → summary, committing real state', async () => {
    const user = userEvent.setup();
    renderRunner();

    // Meet card shows the word and seeds introduction on acknowledge.
    expect(screen.getByRole('heading', { name: 'achieve' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /got it/i }));
    expect(useProgress.getState().words['achieve']?.masteryStage).toBe(1);

    // MCQ shows a real question stem: the headword large, not just options.
    expect(screen.getByText('What does this word mean?')).toBeInTheDocument();
    expect(screen.getByText('achieve', { selector: 'p.font-display' })).toBeInTheDocument();

    // MCQ: tapping an option answers immediately (no separate Check step).
    const wrong = screen.getByRole('button', { name: /a wrong meaning one/i });
    await user.click(wrong);
    expect(await screen.findByText(/not yet/i)).toBeInTheDocument();
    expect(useProgress.getState().events).toHaveLength(1);
    expect(useProgress.getState().events[0]?.correct).toBe(false);

    // Acknowledge → lagged retry ("Another look") → answer it correctly.
    await user.click(screen.getByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/another look/i)).toBeInTheDocument();
    const rightRetry = screen.getByRole('button', { name: /to succeed in reaching/i });
    await user.click(rightRetry);

    // Continue → end-of-session recheck ("Final check") → answer correctly → summary.
    await user.click(await screen.findByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/final check/i)).toBeInTheDocument();
    const right = screen.getByRole('button', { name: /to succeed in reaching/i });
    await user.click(right);
    await user.click(await screen.findByRole('button', { name: /continue/i }));
    expect(await screen.findByText(/session complete/i)).toBeInTheDocument();
    expect(screen.getByText(/to see again tomorrow/i)).toBeInTheDocument();
  });

  it('announces feedback to screen readers via aria-live', async () => {
    const user = userEvent.setup();
    renderRunner();
    await user.click(screen.getByRole('button', { name: /got it/i }));
    const right = screen.getByRole('button', { name: /to succeed in reaching/i });
    await user.click(right);
    // The live region announces the outcome.
    const live = document.querySelector('[aria-live="polite"].sr-only');
    expect(live?.textContent).toMatch(/correct/i);
  });

  it('is fully operable by keyboard alone', async () => {
    const user = userEvent.setup();
    renderRunner();
    // Tab to "Got it" (header exit, audio, and Bengali-reveal come first in DOM order).
    const gotIt = screen.getByRole('button', { name: /got it/i });
    for (let i = 0; i < 8 && document.activeElement !== gotIt; i++) {
      await user.tab();
    }
    expect(gotIt).toHaveFocus();
    // Real Enter-activation on the button (user-event emulates browser click).
    await user.keyboard('{Enter}');
    // fireEvent keydowns are synchronous (real-browser semantics): no test-env
    // race where the activation click lands on the freshly focused Continue.
    const option = await screen.findByRole('button', { name: /to succeed in reaching/i });
    fireEvent.keyDown(option, { key: '1' });
    // '1' answers instantly → feedback visible before any advance key.
    expect(await screen.findByText(/good/i)).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /continue/i }), { key: 'Enter' });
    expect(await screen.findByText(/session complete/i)).toBeInTheDocument();
  });
});
