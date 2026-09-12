// Deterministic topic index (§12). API example `source` labels are the primary
// topic signal at runtime; until enrichment arrives, words are grouped by a
// documented keyword heuristic over their local gloss + study sentence
// (UI grouping only — never learning data).

import type { WordRecord } from '../types/domain';

export const TOPICS = [
  'Education', 'Health', 'Environment', 'Economy', 'Technology',
  'Society', 'Law & Government', 'Science',
] as const;

export type Topic = (typeof TOPICS)[number] | 'General';

const KEYWORDS: { topic: Topic; words: string[] }[] = [
  { topic: 'Education', words: ['school', 'student', 'teach', 'learn', 'university', 'class', 'study', 'academic', 'exam', 'lecture', 'curriculum', 'literacy'] },
  { topic: 'Health', words: ['health', 'medic', 'disease', 'patient', 'hospital', 'doctor', 'drug', 'clinic', 'mental', 'nutrition', 'virus', 'surgery'] },
  { topic: 'Environment', words: ['environment', 'climate', 'pollution', 'energy', 'solar', 'flood', 'erosion', 'wildlife', 'emission', 'sustainab', 'ecolog', 'river', 'ocean', 'forest'] },
  { topic: 'Economy', words: ['econom', 'money', 'bank', 'trade', 'market', 'invest', 'fund', 'budget', 'tax', 'cost', 'price', 'employ', 'job', 'wage', 'business', 'financ'] },
  { topic: 'Technology', words: ['technolog', 'computer', 'software', 'internet', 'digital', 'online', 'data', 'phone', 'network', 'engineer', 'machine', 'electric'] },
  { topic: 'Society', words: ['communit', 'cultur', 'social', 'people', 'famil', 'migrat', 'immigrat', 'urban', 'rural', 'touris', 'media', 'demograph'] },
  { topic: 'Law & Government', words: ['law', 'legal', 'court', 'govern', 'polic', 'parliament', 'elect', 'crime', 'legislat', 'council', 'minister', 'prison'] },
  { topic: 'Science', words: ['scien', 'research', 'experiment', 'laborator', 'chemical', 'physic', 'evolu', 'species', 'planet', 'hypothes', 'theory', 'psycholog'] },
];

/** Deterministic local topic (fallback until API sources arrive). */
export function topicOf(word: WordRecord): Topic {
  const hay = `${word.shortDefinition ?? ''} ${word.sentence}`.toLowerCase();
  let best: Topic = 'General';
  let bestScore = 0;
  for (const { topic, words } of KEYWORDS) {
    let score = 0;
    for (const k of words) {
      if (hay.includes(k)) score += k.length >= 6 ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return bestScore > 0 ? best : 'General';
}
