/** Highlight the target word inside an example sentence (Meet + Word Detail). */
export function highlightWord(sentence: string, word: string, forms: string[] = []): React.ReactNode {
  const targets = [word, ...forms].sort((a, b) => b.length - a.length);
  for (const t of targets) {
    const idx = sentence.toLowerCase().indexOf(t.toLowerCase());
    if (idx >= 0) {
      return (
        <>
          {sentence.slice(0, idx)}
          <mark className="rounded bg-accent-soft px-0.5 font-medium text-accent-deep dark:text-accent">
            {sentence.slice(idx, idx + t.length)}
          </mark>
          {sentence.slice(idx + t.length)}
        </>
      );
    }
  }
  return sentence;
}
