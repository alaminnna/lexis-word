import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useProgress } from '../../store/progress';
import { defaultAIConfig, saveProviderConfig } from '../../services/writing-feedback';
import WritingPage from './WritingPage';

const GOOD_JSON = JSON.stringify({
  scores: { form: true, collocation: false, register: true, meaning: true },
  comment: 'Tighten the collocation.',
});

function renderStudio() {
  return render(
    <MemoryRouter>
      <WritingPage />
    </MemoryRouter>,
  );
}

/** Landing → practice a recommended target. */
async function openWorkspace(user: ReturnType<typeof userEvent.setup>) {
  renderStudio();
  const practice = await screen.findByRole('button', { name: /practice this word/i });
  await user.click(practice);
}

describe('Writing Studio redesigned flow', () => {
  beforeEach(() => {
    localStorage.clear();
    useProgress.getState().resetProgress();
    useProgress.getState().meetWord('achieve', 'meet', Date.now());
    // Lift production so the word qualifies as a recommended target.
    const s = useProgress.getState();
    for (let i = 0; i < 2; i++) {
      s.commitEvent({
        sessionId: 't', wordId: 'achieve', activity: 'sentence-production',
        dimension: 'production', correct: true, responseMs: 60_000,
        hintsUsed: 0, audioReplays: 0, timestamp: Date.now(),
      });
    }
    // The repo .env carries real system keys and vitest loads .env files —
    // clear them unless a test opts in, for hermetic source assertions.
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEY', '');
    vi.stubEnv('VITE_LEXIS_SYSTEM_KEYS', '');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    useProgress.getState().resetProgress();
  });

  it('landing recommends real targets and opens the workspace', async () => {
    const user = userEvent.setup();
    renderStudio();
    expect(await screen.findByText('Recommended for you')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /practice this word/i }));
    // Workspace: target hero, task selector, editor.
    expect(await screen.findByText('Target vocabulary')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Writing task type' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your sentence')).toBeInTheDocument();
  });

  it('saves one self-review event with reflection, then completes', async () => {
    const user = userEvent.setup();
    await openWorkspace(user);
    await user.type(screen.getByLabelText('Your sentence'), 'The results achieve more than expected today.');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    // Compare step: sentence stays primary, examples beside it.
    expect(await screen.findByText('How well did you use the word?')).toBeInTheDocument();
    // Judge all four Yes + leave a reflection, then save.
    for (const label of ['Correct word form', 'Natural collocation', 'Academic register', 'Meaning preserved']) {
      const group = screen.getByRole('group', { name: label });
      await user.click(group.querySelector('button')!);
    }
    await user.type(screen.getByLabelText('What would you improve in this sentence?'), 'Stronger verb next time.');
    await user.click(screen.getByRole('button', { name: /save writing review/i }));
    expect(await screen.findByText('Writing review saved.')).toBeInTheDocument();
    const events = useProgress.getState().events.filter((e) => e.dimension === 'writing');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail?.reflection).toBe('Stronger verb next time.');
    expect(events[0]!.detail?.aiVerified ?? false).toBe(false);
  });

  it('displays the AI verdict card after a successful AI grade', async () => {
    saveProviderConfig({
      ...defaultAIConfig(),
      apis: [{ id: 'api1', name: 'api1', enabled: true, baseUrl: '', model: 'z-ai/glm-5.3-flash', keys: ['sk-test-key'], invalid: false }],
    });
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: GOOD_JSON } }] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })),
    ));
    const user = userEvent.setup();
    await openWorkspace(user);
    await user.type(screen.getByLabelText('Your sentence'), 'The results achieve more than expected today.');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    for (const label of ['Correct word form', 'Natural collocation', 'Academic register', 'Meaning preserved']) {
      const group = screen.getByRole('group', { name: label });
      await user.click(group.querySelector('button')!);
    }
    await user.click(screen.getByRole('button', { name: /save/i }));
    // Verdict names the grader api, marks dimensions, quotes advice.
    expect(await screen.findByText(/Tighten the collocation/)).toBeInTheDocument();
    expect(screen.getByText('Collocation')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === 'Graded with your keys · api1 · z-ai/glm-5.3-flash.')).toBeInTheDocument();
    const events = useProgress.getState().events.filter((e) => e.dimension === 'writing');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail?.aiVerified).toBe(true);
  });

  it('locks Submit until the draft contains the target word', async () => {
    const user = userEvent.setup();
    await openWorkspace(user);
    await user.type(screen.getByLabelText('Your sentence'), 'ok ok ok');
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(screen.getByText(/Include “achieve” to continue/)).toBeInTheDocument();
  });

  it('restores an interrupted draft with a notice', async () => {
    const user = userEvent.setup();
    await openWorkspace(user);
    await user.type(screen.getByLabelText('Your sentence'), 'A draft about achieve here.');
    // Back to landing (exit before review) then practice again.
    await user.click(screen.getByRole('button', { name: /writing studio \/ vocabulary production/i }));
    await user.click(await screen.findByRole('button', { name: /practice this word/i }));
    expect(await screen.findByText(/Draft restored/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your sentence')).toHaveValue('A draft about achieve here.');
  });
});
