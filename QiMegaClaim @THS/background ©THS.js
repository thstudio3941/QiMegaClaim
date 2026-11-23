'use strict';

// Runs in the website's MAIN world: cookies stay in the page and never enter logs/storage.
async function fabRequest(request) {
  if (location.origin !== 'https://www.fab.com') return {error: 'wrongPage'};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const headers = {Accept: 'application/json'};
    const init = {method: request.method, headers, credentials: 'include', cache: 'no-store',
      redirect: 'error', signal: controller.signal};
    if (request.method === 'POST') {
      const token = document.cookie.match(/(?:^|;\s*)fab_csrftoken=([^;]+)/)?.[1];
      if (!token) return {error: 'csrfMissing'};
      headers['X-CSRFToken'] = decodeURIComponent(token);
      init.body = new FormData();
      init.body.set('offer_id', request.offerId);
    }
    const response = await fetch(request.path, init);
    const raw = await response.text();
    let data = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* HTML challenges are not successful claims. */ }
    return {status: response.status, retryAfter: response.headers.get('Retry-After'),
      json: data, valid: !raw || data !== null};
  } catch (error) { return {error: error.name === 'AbortError' ? 'timeout' : 'network'}; }
  finally { clearTimeout(timer); }
}

function validRequest(r) {
  if (!r || typeof r.path !== 'string') return false;
  if (r.method === 'POST') return /^\/i\/listings\/[a-f\d-]{36}\/add-to-library$/.test(r.path) &&
    typeof r.offerId === 'string' && /^[\w-]{1,100}$/.test(r.offerId);
  if (r.method !== 'GET') return false;
  if (r.path === '/i/users/me') return true;
  if (/^\/i\/(?:listings|users\/me\/listings-states)\/[a-f\d-]{36}$/.test(r.path)) return true;
  const u = new URL(r.path, 'https://www.fab.com');
  if (u.origin === 'https://www.fab.com' && u.pathname === '/i/library/search') {
    return [...u.searchParams.keys()].every(k => k === 'cursor') && u.searchParams.getAll('cursor').length <= 1 &&
      (!u.searchParams.has('cursor') || !!u.searchParams.get('cursor'));
  }
  if (u.origin === 'https://www.fab.com' && u.pathname === '/i/users/me/listings-states') {
    const ids = u.searchParams.getAll('listingIds');
    return ids.length > 0 && ids.length <= 24 && new Set(ids).size === ids.length &&
      ids.every(id => /^[a-f\d-]{36}$/.test(id)) && [...u.searchParams.keys()].every(k => k === 'listingIds');
  }
  if (u.origin === 'https://www.fab.com' && u.pathname === '/i/listings/search' && u.searchParams.has('count')) {
    return u.searchParams.get('seller') === 'Quixel Megascans' && u.searchParams.get('count') === '0' &&
      u.searchParams.get('aggregate_on') === 'listing_type' &&
      [...u.searchParams.keys()].every(k => ['seller', 'count', 'aggregate_on'].includes(k));
  }
  return u.origin === 'https://www.fab.com' && u.pathname === '/i/listings/search' &&
    u.searchParams.get('seller') === 'Quixel Megascans' &&
    [...u.searchParams.keys()].every(k => ['seller', 'sort_by', 'cursor'].includes(k));
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'QIMEGA_API') return;
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.frameId !== 0 ||
      new URL(sender.url).origin !== 'https://www.fab.com' || !validRequest(message.request)) {
    reply({error: 'wrongPage'}); return;
  }
  chrome.scripting.executeScript({target: {tabId: sender.tab.id, frameIds: [0]}, world: 'MAIN',
    func: fabRequest, args: [message.request]})
    .then(results => reply(results[0]?.result || {error: 'network'}))
    .catch(() => reply({error: 'network'}));
  return true;
});
