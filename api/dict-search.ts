// Vercel Serverless Function: same-origin dictionary proxy (production CORS fix).
//
// WHY: the dictionary API (jumpinto.com) sends no CORS headers, so browsers
// block direct cross-origin reads and the app degrades to "Enriched dictionary
// data is offline". The Vite dev proxy (`/api-dict`) only exists on localhost,
// and `.env` (VITE_DICT_PROXY=1) is gitignored so Vercel builds never had it.
// This function runs server-side (no CORS), forwards with browser-like headers
// to satisfy Cloudflare bot management, and returns JSON same-origin.
//
// Usage (client): GET /api/dict-search?sword=ACHIEVE

const UPSTREAM = 'https://www.jumpinto.com/api/v1/assessment/ielts/vocab/vocabulary/search';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function handler(req: any, res: any): Promise<void> {
  const sword = Array.isArray(req.query?.sword) ? req.query.sword[0] : req.query?.sword;

  if (typeof sword !== 'string' || !sword.trim() || sword.length > 64) {
    res.status(400).json({ error: 'Missing or invalid ?sword=WORD query param.' });
    return;
  }

  const url = `${UPSTREAM}?sword=${encodeURIComponent(sword.trim().toUpperCase())}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: 'https://www.jumpinto.com/ielts/vocabulary',
        'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      },
    });

    const contentType = upstream.headers.get('content-type') ?? '';
    const body = await upstream.text();

    if (!upstream.ok || !contentType.includes('application/json')) {
      res.status(502).json({ error: `Upstream HTTP ${upstream.status}` });
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Same-origin callers only, but harmless to cache briefly at the edge.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.status(200).send(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Proxy request failed.';
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timer);
  }
}
