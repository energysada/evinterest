// Cloudflare Pages Function — GET /api/brent
// Fetches live Brent crude price from Yahoo Finance, caches 10 min

export async function onRequest(context) {
    const cacheKey = 'brent-price';
    const cache = caches.default;

    // Check cache first
    const cached = await cache.match(new Request('https://ev-tracker-cache/' + cacheKey));
    if (cached) return cached;

    try {
        const url = 'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=5d';
        const resp = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        const data = await resp.json();

        const result = data?.chart?.result?.[0];
        const meta = result?.meta;
        const price = meta?.regularMarketPrice;
        const prevClose = meta?.chartPreviousClose;

        if (!price) throw new Error('No price data');

        // Calculate change from Feb 28 baseline (~$72)
        const baseline = 72;
        const pctFromBaseline = (((price - baseline) / baseline) * 100).toFixed(0);

        const body = JSON.stringify({
            price: price.toFixed(2),
            prevClose: prevClose?.toFixed(2),
            changeFromBaseline: `+${pctFromBaseline}%`,
            label: `Brent: $${price.toFixed(0)}/bbl`,
            sublabel: `+${pctFromBaseline}% since Feb 28`,
            ts: new Date().toISOString(),
        });

        const response = new Response(body, {
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'public, max-age=600',
                'Access-Control-Allow-Origin': '*',
            },
        });

        // Cache for 10 min
        context.waitUntil(cache.put(new Request('https://ev-tracker-cache/' + cacheKey), response.clone()));

        return response;
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
