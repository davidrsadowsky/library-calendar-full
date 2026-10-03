// Cloudflare Worker: last-resort relay for fetch_calendars.js.
//
// Some library sites occasionally geo-block whichever random Azure IP
// GitHub Actions happens to run on that night (confirmed via New Rochelle's
// "inaccessible due to geographical restrictions" response, Oct 2026).
// Cloudflare's network uses different IPs than GitHub Actions, so relaying
// through here sidesteps that. Only used as a fallback when a normal fetch
// AND the got-scraping fallback have both already failed — see fetchHtml()
// in fetch_calendars.js.
//
// Deploy this in the Cloudflare dashboard (Workers & Pages -> Create ->
// paste this code -> Deploy), then add a PROXY_TOKEN secret (Settings ->
// Variables and Secrets) so random visitors who find the worker's URL can't
// use it as an open proxy.

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const token = incoming.searchParams.get('token');
    const targetUrl = incoming.searchParams.get('url');

    if (!env.PROXY_TOKEN || token !== env.PROXY_TOKEN) {
      return new Response('Forbidden', { status: 403 });
    }
    if (!targetUrl) {
      return new Response('Missing url param', { status: 400 });
    }

    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
            'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } catch (e) {
      return new Response(`Fetch failed: ${e.message}`, { status: 502 });
    }
  },
};
