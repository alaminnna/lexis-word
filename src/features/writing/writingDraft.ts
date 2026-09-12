// Per-word, per-task draft autosave (localStorage). Drafts make "exit before
// review" safe: reopening restores the text with a notice; saving clears it.

export interface Draft {
  text: string;
  updatedAt: number;
}

const MAX_CHARS = 2000;

export function draftKey(wordId: string, task: string): string {
  return `lexis:draft:${wordId}:${task}`;
}

export function loadDraft(wordId: string, task: string): Draft | null {
  try {
    const raw = localStorage.getItem(draftKey(wordId, task));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (typeof parsed.text !== 'string' || !parsed.text) return null;
    return { text: parsed.text.slice(0, MAX_CHARS), updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0 };
  } catch {
    return null;
  }
}

export function saveDraft(wordId: string, task: string, text: string): void {
  try {
    if (!text.trim()) {
      localStorage.removeItem(draftKey(wordId, task));
      return;
    }
    localStorage.setItem(draftKey(wordId, task), JSON.stringify({ text: text.slice(0, MAX_CHARS), updatedAt: Date.now() }));
  } catch {
    // drafts are convenience state; never break writing on quota errors
  }
}

export function clearDraft(wordId: string, task: string): void {
  try {
    localStorage.removeItem(draftKey(wordId, task));
  } catch {
    // ignore
  }
}
