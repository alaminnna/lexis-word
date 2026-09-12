import { useEffect, useRef, useState, type ReactNode } from 'react';
import { containsWordOrForm } from '../../../utils/text';
import { Button } from '../../../components/ui/Button';
import { clearDraft, loadDraft, saveDraft } from '../writingDraft';
import type { WritingTaskKind } from '../writingSelectors';

/**
 * Premium writing editor (§4.D): plain textarea, calm focus, live word count,
 * per-word/per-task draft autosave with a restore notice, Ctrl+Enter submit,
 * scroll-into-view on focus for mobile keyboards. No toolbar, no autocomplete.
 */
export function WritingEditor({ wordId, task, prompt, hint, placeholder, submitLabel = 'Submit', autoFocusKey, requireWord, onEscape, onSubmit }: {
  wordId: string;
  task: WritingTaskKind;
  prompt: ReactNode;
  hint: string;
  placeholder: string;
  submitLabel?: string;
  /** change to refocus (word/task switches) */
  autoFocusKey: string;
  /** when set, Submit stays locked until the draft contains the word/forms */
  requireWord?: { word: string; forms: string[] };
  onEscape?: () => void;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [restored, setRestored] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const draft = loadDraft(wordId, task);
    setText(draft?.text ?? '');
    setRestored(!!draft?.text);
    // Autofocus only for pointer/keyboard contexts — on touch, focus yanks the
    // virtual keyboard open over the prompt before the person has read it.
    const finePointer = typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: fine)').matches;
    if (finePointer) areaRef.current?.focus();
  }, [wordId, task, autoFocusKey]);

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const hasWord = !requireWord || containsWordOrForm(text, requireWord.word, requireWord.forms);
  const ready = words >= 3 && hasWord;

  const submit = (): void => {
    if (!ready) return;
    clearDraft(wordId, task);
    onSubmit(text);
  };

  return (
    <div>
      <div className="mb-2 text-[17px] leading-relaxed">{prompt}</div>
      {restored && (
        <p className="mb-2 text-sm text-ink-soft" aria-live="polite">
          Draft restored — pick up where you left off, or clear it below.
        </p>
      )}
      <label htmlFor={`ws-editor-${wordId}-${task}`} className="sr-only">Your sentence</label>
      <textarea
        id={`ws-editor-${wordId}-${task}`}
        ref={areaRef}
        value={text}
        rows={task === 'transform' ? 2 : 3}
        onChange={(e) => {
          setText(e.target.value);
          setRestored(false);
          saveDraft(wordId, task, e.target.value);
        }}
        onFocus={(e) => {
          // Mobile keyboards cover inputs — keep the caret visible (§15).
          // Guarded: jsdom (tests) has no scrollIntoView.
          const el = e.currentTarget;
          if (typeof el.scrollIntoView !== 'function') return;
          const reduced = typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          else if (e.key === 'Escape' && onEscape) {
            // Esc leaves the editor; confirm when there's work in it.
            if (text.trim() && !window.confirm('Leave the editor? Your draft is auto-saved.')) {
              e.preventDefault();
              return;
            }
            onEscape();
          }
        }}
        placeholder={placeholder}
        aria-describedby={`ws-hint-${wordId}-${task}`}
        className="min-h-[96px] w-full rounded-xl border border-line bg-paper px-4 py-3 text-lg leading-relaxed transition-calm placeholder:text-ink-soft focus:border-accent focus:outline-none"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
      />
      <p id={`ws-hint-${wordId}-${task}`} className="mt-1 text-sm text-ink-soft">
        {hint} · {words} word{words === 1 ? '' : 's'} · Ctrl+Enter submits.
        {requireWord && !hasWord && (
          <span className="block text-warn">Include “{requireWord.word}” to continue.</span>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button disabled={!ready} onClick={submit} aria-describedby={!ready && requireWord ? `ws-hint-${wordId}-${task}` : undefined}>
          {submitLabel}
        </Button>
        {restored && (
          <button
            onClick={() => {
              clearDraft(wordId, task);
              setText('');
              setRestored(false);
              areaRef.current?.focus();
            }}
            className="inline-flex min-h-[44px] cursor-pointer items-center px-3 text-sm text-ink-soft hover:text-ink"
          >
            Discard draft
          </button>
        )}
      </div>
    </div>
  );
}
