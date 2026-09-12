// Pure text helpers: levenshtein alignment, normalization, word matching.
// No React imports — safe for engine + tests.

/** Levenshtein edit distance (iterative, O(min(m,n)) space). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Work on the shorter string as the column vector.
  if (a.length > b.length) [a, b] = [b, a];
  let prev = new Array<number>(a.length + 1);
  let curr = new Array<number>(a.length + 1);
  for (let i = 0; i <= a.length; i++) prev[i] = i;
  for (let j = 1; j <= b.length; j++) {
    curr[0] = j;
    const bj = b.charCodeAt(j - 1);
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === bj ? 0 : 1;
      curr[i] = Math.min(prev[i]! + 1, curr[i - 1]! + 1, prev[i - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[a.length]!;
}

/** Lowercase + trim + collapse whitespace + strip surrounding punctuation. */
export function normalizeAnswer(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/^['"“”‘’.,;:!?()[\]{}]+|['"“”‘’.,;:!?()[\]{}]+$/g, '');
}

/** True if `word` (or an inflectional suffix variant) occurs as a standalone token. */
export function containsWordOrForm(sentence: string, word: string, forms: string[] = []): boolean {
  const hay = ` ${sentence.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ')} `;
  const targets = [word.toLowerCase(), ...forms.map((f) => f.toLowerCase())];
  return targets.some(
    (t) =>
      hay.includes(` ${t} `) ||
      hay.includes(` ${t}s `) ||
      hay.includes(` ${t}es `) ||
      hay.includes(` ${t}ed `) ||
      hay.includes(` ${t}ing `),
  );
}

/** Blank the target word (or its forms) inside a sentence for cloze items. */
export function blankTarget(sentence: string, word: string, forms: string[] = []): string | null {
  const targets = [word, ...forms].sort((a, b) => b.length - a.length);
  for (const t of targets) {
    const re = new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i');
    if (re.test(sentence)) return sentence.replace(re, '＿＿＿＿');
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Stable slug for headwords (mirrors scripts/merge-glosses.mjs). */
export function slugify(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Content-word extraction for deterministic collocation candidates (§12). */
const STOPWORDS = new Set(
  'a,an,the,and,or,but,of,at,by,for,with,to,in,on,from,as,is,are,was,were,be,been,being,it,its,this,that,these,those,he,she,they,we,you,i,me,him,her,us,them,his,our,their,your,my,not,no,so,very,can,will,would,should,could,may,might,must,shall,do,does,did,have,has,had,having,all,any,each,other,more,most,some,such,than,then,there,here,when,where,which,who,whom,what,how,why,because,while,until,though,although,if,into,out,up,down,over,under,again,once,only,also,just,about,between,through,during,before,after,above,below,off,against,among,across,per,via,within,without'.split(','),
);

export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
