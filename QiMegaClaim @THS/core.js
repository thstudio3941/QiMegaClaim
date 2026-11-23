/* Shared, dependency-free protocol and scheduling rules. */
((root) => {
  'use strict';
  const SELLER = '45ea3429-f62c-4f17-aa15-5bb9dfcd0079';
  const TARGET = 'https://www.fab.com/sellers/Quixel%20Megascans';
  const finite = (value, fallback, min, max) => Number.isFinite(Number(value))
    ? Math.min(max, Math.max(min, Math.trunc(Number(value)))) : fallback;
  function settings(value = {}) {
    return {concurrency: finite(value.concurrency, 3, 3, 10), interval: finite(value.interval, 500, 150, 60000)};
  }
  function rateFloor(meta = {}) {
    // The old `effective` field mixed slider values with backoff. Only explicit backoff survives.
    const values = [meta.backoffInterval, meta.scanEffective].filter(value => Number.isFinite(value) && value >= 1000);
    return Math.min(60000, Math.max(0, ...values));
  }
  function isTarget(url) {
    try { const u = new URL(url); return u.origin === 'https://www.fab.com' &&
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?sellers\/Quixel Megascans\/?$/i.test(decodeURIComponent(u.pathname));
    } catch { return false; }
  }
  function freeOffer(detail) {
    if (detail?.user?.uid !== SELLER || !Array.isArray(detail.licenses)) return null;
    const offers = detail.licenses.filter(l => typeof l.offerId === 'string' && l.offerId &&
      l.priceTier && typeof l.priceTier.price === 'number' && l.priceTier.price === 0 &&
      (l.priceTier.discountedPrice == null || l.priceTier.discountedPrice === 0));
    // Mirror Fab's default free-license order; this is an API offer, not a user setting.
    const order = ['personal', 'professional', 'uefn-reference-only'];
    const rank = offer => order.includes(offer.slug) ? order.indexOf(offer.slug) : order.length;
    return offers.sort((a, b) => rank(a) - rank(b))[0] || null;
  }
  function ownership(state) {
    // Fab's Library UI derives the saved state from downloadable ownership,
    // rather than treating general acquisition/access as a saved library item.
    if (Array.isArray(state?.ownership)) return state.ownership.some(entry => typeof entry?.slug === 'string' && !!entry.slug);
    if (typeof state?.acquired !== 'boolean') throw new Error('schema');
    return state.acquired;
  }
  function account(me) {
    if (me?.isAnonymous === true) throw new Error('loginRequired');
    // Fab's signed-in serializer can omit the anonymous-only flag.
    // A real stable UID is still required for account-isolated progress.
    if ((me?.isAnonymous !== undefined && me.isAnonymous !== false) ||
      typeof me?.uid !== 'string' || !/^[a-z\d_-]{1,128}$/i.test(me.uid) ||
      ['anonymous', 'null', 'undefined'].includes(me.uid.toLowerCase())) throw new Error('schema');
    return me.uid;
  }
  function shape(value) {
    if (value === null) return {type: 'null'};
    if (Array.isArray(value)) return {type: 'array', length: value.length};
    if (typeof value !== 'object') return {type: typeof value};
    // Field names and types only: never record account/credential values.
    return {type: 'object', fields: Object.fromEntries(Object.keys(value).sort().slice(0, 80)
      .map(key => [key, value[key] === null ? 'null' : Array.isArray(value[key]) ? 'array' : typeof value[key]]))};
  }
  function retryMs(header, now = Date.now()) {
    if (header == null || header === '') return null;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    return Number.isFinite(date) ? Math.max(0, date - now) : null;
  }
  function backoff(current, header, now = Date.now()) {
    const official = retryMs(header, now);
    const interval = Math.min(60000, Math.max(1000, current * 2));
    return {interval, until: now + Math.max(official ?? 0, interval, official == null ? 5000 : 0), official};
  }
  function page(data) {
    if (!Array.isArray(data?.results) || !data.cursors || !Object.hasOwn(data.cursors, 'next') ||
      !(data.cursors.next === null || typeof data.cursors.next === 'string')) throw new Error('schema');
    for (const item of data.results) if (typeof item.uid !== 'string' || item.user?.uid !== SELLER) throw new Error('sellerMismatch');
    return {items: data.results, next: data.cursors.next};
  }
  function batchStates(data, ids) {
    const rows = Array.isArray(data) ? data : data?.results;
    if (!Array.isArray(rows)) throw new Error('schema');
    const expected = new Set(ids), found = new Map();
    for (const row of rows) {
      if (!expected.has(row?.uid) || found.has(row.uid)) throw new Error('schema');
      ownership(row); found.set(row.uid, row);
    }
    if (found.size !== expected.size) throw new Error('schema');
    return found;
  }
  function libraryPage(data) {
    const uuid = value => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);
    if (!Array.isArray(data?.results) || !data.cursors || !Object.hasOwn(data.cursors, 'next') ||
      !(data.cursors.next === null || (typeof data.cursors.next === 'string' && data.cursors.next.length > 0))) throw new Error('schema');
    const owned = [], assets = [];
    for (const row of data.results) {
      if (!uuid(row?.uid) || !uuid(row.listing?.uid) || !uuid(row.listing?.publisher?.uid) ||
        typeof row.source !== 'string') throw new Error('schema');
      assets.push(row.uid);
      if (row.source === 'acquired' && row.listing.publisher.uid === SELLER) owned.push(row.listing.uid);
    }
    return {owned, assets, next: data.cursors.next};
  }
  function scanState(price, state) {
    if (ownership(state)) return 'owned';
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return 'unknown';
    return price === 0 ? 'pending' : 'skipped';
  }
  function catalogTotal(data) {
    const group = data?.aggregations?.listingType;
    if (!group || group.othersCount !== 0 || !group.buckets || typeof group.buckets !== 'object' || Array.isArray(group.buckets)) return null;
    let total = 0;
    for (const bucket of Object.values(group.buckets)) {
      if (!Number.isSafeInteger(bucket?.docCount) || bucket.docCount < 0) return null;
      total += bucket.docCount;
      if (!Number.isSafeInteger(total)) return null;
    }
    return total;
  }
  const api = {SELLER, TARGET, settings, rateFloor, isTarget, freeOffer, ownership, account, shape, retryMs, backoff, page, libraryPage, batchStates, scanState, catalogTotal};
  root.QiMega = Object.freeze(api);
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
