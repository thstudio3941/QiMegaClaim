/* QiMegaClaim: the tab owns work; durable checkpoints survive reloads. */
(() => {
  'use strict';
  if (globalThis.__qiMegaMounted) { globalThis.__qiMegaShow?.(); return; }
  globalThis.__qiMegaMounted = true;
  // Removed extensions can leave their old DOM in an already-open tab.
  document.getElementById?.('ths-qimega')?.remove();
  document.getElementById?.('ths-qimega-spacer')?.remove();
  const Q = globalThis.QiMega;
  const t = (key, ...args) => chrome.i18n.getMessage(key, args.map(String)) || key;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const fail = (code, status = 0) => Object.assign(new Error(code), {code, status});
  let config = Q.settings(), meta = {}, items = new Map(), logs = [];
  let accountId = null, prefix = '', running = false, stopping = false, loggedIn = false;
  let statusKey = 'ready', statusArgs = [], effective = config.interval, cooldown = 0, official = null;
  let lastRequest = 0, gateTail = Promise.resolve(), mounted = false, hidden = false;
  let initialized = false, checkingLogin = false, lastAuthCheck = -Infinity, lastResponse = null;
  let diagnosticTail = Promise.resolve();
  let backoffInterval = 0, wakeJob = () => {};
  let total = null, totalUpdated = 0, lastTotalCheck = 0, totalFresh = false;
  let libraryIds = null, libraryUpdated = 0, libraryFresh = false;
  const readLanes = {
    catalog: {active: 0, limit: 1, last: 0, waiters: []},
    lookup: {active: 0, limit: 4, last: 0, waiters: []}
  };
  const READ_GAP = 50, CHECK_WORKERS = 2, OWNERSHIP_TTL = 2000;
  let meRequest = null, accountObservation = null;
  const ownershipObservations = new Map();
  const requestGap = () => Math.max(config.interval, backoffInterval);

  const host = document.createElement('div');
  host.id = 'ths-qimega';
  host.style.cssText = 'position:fixed!important;bottom:0!important;left:0!important;width:100%!important;z-index:2147483647!important;';
  const root = host.attachShadow({mode: 'closed'});
  root.innerHTML = `<style>
    :host{color-scheme:dark;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#eaf5ef}
    *{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #3b4c45;border-radius:7px;padding:8px 13px;background:#202c27;color:#edf8f1;white-space:nowrap}button:hover{background:#30453a}button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid #b9fbd7;outline-offset:3px}
    #bar{background:#121a17f7;border-top:1px solid #41554a;padding:14px 22px 12px;box-shadow:0 -8px 32px #0005;max-height:65vh;overflow:auto}
    .row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.top{justify-content:space-between;margin-bottom:12px}.brand{font-size:17px;font-weight:750;letter-spacing:-.4px}.brand small{font-size:10px;letter-spacing:1px;color:#93b19f;margin-left:8px}#auth{font-size:12px;color:#bbd3c4;border:1px solid #3a5144;border-radius:20px;padding:4px 10px}#stats{gap:20px}.stat{color:#a3b9ad;font-size:11px}.stat b{display:block;font-size:23px;font-variant-numeric:tabular-nums;color:#e8f4ec;font-weight:600}.stat[data-key=owned] b{color:#aff0ca}.stat[data-key=pending] b{color:#efcf83}
    .controls{margin-top:12px}#run{background:#b5f3cf;color:#14251c;border-color:#b5f3cf;font-weight:750}label{color:#afc4b8;font-size:12px;display:flex;gap:7px;align-items:center}input,select{border:1px solid #3b4c45;border-radius:6px;padding:6px;background:#0c120f;color:#e8f4ec}input{width:74px}#helpBtn{border-radius:50%;height:20px;width:20px;padding:0;font-size:12px}#hide{padding:2px 8px}#notice{font-size:11px;color:#d7c28d;margin:7px 0 0}#status{margin-top:7px;color:#b6ccbf;font-size:12px;overflow-wrap:anywhere}progress{width:100%;height:5px;accent-color:#b5f3cf;display:block;margin-top:12px}#help{padding:24px;border:1px solid #526b5b;border-radius:12px;width:min(640px,90vw);max-height:80vh;background:#17251d;color:#d7e7dd;font:14px/1.9 system-ui}#help::backdrop{background:#0009}#help p{white-space:pre-line}#mini{margin:0 18px 12px auto;display:block;background:#1b3025}#bar[hidden],#mini[hidden]{display:none}@media(max-width:850px){#bar{padding:12px}.top{gap:10px}#stats{gap:14px}.controls{gap:8px}.stat b{font-size:20px}}
    #login{height:28px;padding:3px 10px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1}
    #hide{width:28px;height:28px;padding:0;display:inline-flex;align-items:center;justify-content:center}
    .chevron{display:inline-block;width:12px;height:12px;background:currentColor;clip-path:polygon(0 27.7778%,50% 94.4444%,100% 27.7778%);flex:0 0 auto}
    .chevron.up{transform:rotate(180deg)}#mini{display:flex;align-items:center;justify-content:center;gap:9px;width:max-content}
    </style><section id="bar" aria-label="QiMegaClaim">
    <div class="row top"><div class="row"><span class="brand">QiMegaClaim<small>©THS · QUIXEL MEGASCANS</small></span><span id="auth"></span><button id="login"></button></div><div class="row"><button id="helpBtn" aria-expanded="false">!</button><button id="export"></button><button id="hide"><span class="chevron" aria-hidden="true"></span></button></div></div>
    <div class="row" id="stats"></div>
    <div class="row controls"><button id="run"></button><button id="scan"></button><button id="resume"></button><button id="pause"></button>
    <label><span id="concurrencyLabel"></span><input id="concurrency" type="number" min="3" max="10" step="1"></label>
    <label><span id="intervalLabel"></span><input id="interval" type="number" min="150" max="60000" step="50"></label>
    </div>
    <progress id="progress" max="1" value="0"></progress><div id="status" role="status" aria-live="polite"></div><p id="notice"></p>
    </section><dialog id="help" aria-labelledby="helpTitle"><h3 id="helpTitle"></h3><p id="helpText"></p><button id="helpClose"></button></dialog><button id="mini" hidden>QiMegaClaim ©THS <span class="chevron up" aria-hidden="true"></span></button>`;
  const $ = id => root.getElementById(id);
  for (const key of ['total', 'scanned', 'owned', 'pending', 'unknown', 'skipped', 'failed']) {
    const el = document.createElement('div'); el.className = 'stat'; el.dataset.key = key;
    const label = document.createElement('span'); label.textContent = t(key);
    const value = document.createElement('b'); value.id = `count-${key}`; value.textContent = '0';
    el.append(label, value); $('stats').append(el);
  }
  for (const key of ['run', 'scan', 'resume', 'pause', 'export', 'login', 'concurrencyLabel', 'intervalLabel']) $(key).textContent = t(key);
  for (const key of ['helpBtn', 'hide']) { $(key).title = t(key); $(key).setAttribute('aria-label', t(key)); }
  $('helpTitle').textContent = t('helpBtn'); $('helpText').textContent = t('helpText'); $('helpClose').textContent = t('close');

  function log(event, details = '') {
    const entry = {at: new Date().toISOString(), event, details};
    logs.push(entry); logs = logs.slice(-200);
    console.log('[QiMegaClaim]', event, details);
    const snapshot = structuredClone(logs);
    diagnosticTail = diagnosticTail.then(() => chrome.storage.local.set({qmDiagnostics: snapshot}))
      .catch(() => console.warn('[QiMegaClaim] Diagnostic storage unavailable'));
  }
  function status(key, ...args) { statusKey = key; statusArgs = args; render(); }
  function render() {
    const counts = {scanned: items.size, owned: 0, pending: 0, unknown: 0, skipped: 0, failed: 0};
    for (const item of items.values()) if (Object.hasOwn(counts, item.state)) counts[item.state]++;
    for (const key of Object.keys(counts)) $(`count-${key}`).textContent = counts[key].toLocaleString();
    const allOwned = libraryIds === null ? null : new Set([...libraryIds,
      ...[...items.values()].filter(item => item.state === 'owned').map(item => item.uid)]);
    $('count-owned').textContent = allOwned === null ? t('ownedUnverified') :
      allOwned.size.toLocaleString();
    $('count-owned').title = t('ownedScope');
    $('count-total').textContent = total === null ? '—' : total.toLocaleString() + (totalFresh ? '' : t('totalCachedSuffix'));
    $('count-total').title = t(total === null ? 'totalUnavailable' : totalFresh ? 'totalLive' : 'totalCached');
    $('auth').textContent = t(checkingLogin ? 'checkingLogin' : loggedIn ? 'loggedIn' : 'unverified');
    $('status').textContent = t(statusKey, ...statusArgs);
    $('run').disabled = running; $('scan').disabled = running;
    $('resume').disabled = running || !meta.canResume || !['run', 'scan'].includes(meta.taskMode);
    $('login').disabled = running; $('pause').disabled = !running || checkingLogin || stopping;
    for (const key of ['concurrency', 'interval']) $(key).disabled = running;
    const remaining = Math.max(0, Math.ceil((cooldown - Date.now()) / 1000));
    $('notice').textContent = t('rateInfo', config.interval, requestGap(),
      t(backoffInterval ? 'backoffActive' : 'backoffInactive'),
      official == null ? t('notProvided') : t('seconds', official / 1000), remaining) +
      (meta.rateAdjustment ? ' · ' + t('rateAdjusted', meta.rateAdjustment.from, meta.rateAdjustment.to, meta.rateAdjustment.http || '429/503') : '');
    $('progress').max = Math.max(meta.taskMode === 'run' || meta.phase === 'scan' ? total || 0 : 0, items.size, 1);
    $('progress').value = meta.phase === 'library' ? 0 : meta.taskMode === 'run' ? counts.owned + counts.skipped : items.size - counts.unknown;
  }
  function showSettings() { for (const key of ['concurrency', 'interval']) $(key).value = config[key]; }
  async function syncRateSetting(http) {
    const adjusted = requestGap();
    if (adjusted <= config.interval) return;
    const from = config.interval;
    config = {...config, interval: adjusted};
    meta.rateAdjustment = {from, to: adjusted, http, at: Date.now()};
    showSettings(); render();
    log('RATE_SETTING_ADJUSTED', meta.rateAdjustment);
    await chrome.storage.local.set({qmSettings: {...config}});
  }
  function checkStop() { if (stopping || !Q.isTarget(location.href)) throw fail('paused'); }
  function wakeReads() {
    for (const lane of Object.values(readLanes)) {
      const waiters = lane.waiters; lane.waiters = [];
      for (const resolve of waiters) resolve();
    }
  }
  async function acquireRead(lane) {
    while (true) {
      checkStop();
      if (lane.active < lane.limit) {
        lane.active++;
        return () => { lane.active--; wakeReads(); };
      }
      await new Promise(resolve => lane.waiters.push(resolve));
    }
  }
  async function gate(method, lane, dispatch) {
    const due = () => Math.max(cooldown, backoffInterval ? lastRequest + backoffInterval : 0,
      method === 'POST' ? 0 : lane.last + READ_GAP);
    while (true) {
      checkStop();
      const wait = due() - Date.now();
      if (wait > 0) { await sleep(Math.min(wait, 200)); continue; }
      let release;
      const previous = gateTail; gateTail = new Promise(resolve => { release = resolve; });
      await previous;
      try {
        checkStop();
        if (due() > Date.now()) continue;
        lastRequest = Date.now();
        if (method !== 'POST') lane.last = lastRequest;
        return {pending: dispatch()};
      } finally { release(); }
    }
  }
  async function api(path, method = 'GET', offerId) {
    const lane = path.startsWith('/i/listings/search?') ? readLanes.catalog : readLanes.lookup;
    for (let attempt = 0; attempt < 5; attempt++) {
      const releaseRead = method === 'GET' ? await acquireRead(lane) : () => {};
      let result;
      try {
        const ticket = await gate(method, lane, () => {
          try {
            return chrome.runtime.sendMessage({type: 'QIMEGA_API', request: {path, method, offerId}})
              .then(response => ({response}), () => ({transportError: true}));
          } catch { return Promise.resolve({transportError: true}); }
        });
        result = await ticket.pending;
      } finally { releaseRead(); }
      if (result.transportError) throw fail('network');
      const response = result.response;
      lastResponse = {path, method, status: response?.status || 0, valid: response?.valid ?? false,
        shape: Q.shape(response?.json ?? null)};
      if (!response || response.error) throw fail(response?.error || 'network');
      if (response.status === 429 || response.status === 503) {
        const backoff = Q.backoff(method === 'POST' ? requestGap() : Math.max(READ_GAP, backoffInterval), response.retryAfter);
        backoffInterval = backoff.interval;
        effective = requestGap();
        cooldown = Math.max(cooldown, backoff.until); official = backoff.official;
        log('RATE_LIMIT', {http: response.status, interval: requestGap(), retryMs: official});
        await syncRateSetting(response.status);
        await saveMeta(); render();
        // POST may have been accepted before an intermediary returned 503. Reconcile next run.
        if (method === 'POST' && response.status === 503) throw fail('uncertain', response.status);
        continue;
      }
      if (response.status === 401) { loggedIn = false; throw fail('loginRequired', 401); }
      if (response.status === 403) throw fail('forbidden', 403);
      if (response.status < 200 || response.status >= 300) {
        if (method === 'GET' && response.status >= 500 && attempt < 4) {
          cooldown = Math.max(cooldown, Date.now() + 1000 * 2 ** attempt); continue;
        }
        throw fail('httpError', response.status);
      }
      if (!response.valid || (method === 'GET' && response.json === null)) throw fail('schema');
      return response.json;
    }
    throw fail('rateStopped', 429);
  }
  async function verify(expected, allowRecent = false) {
    if (allowRecent && accountObservation && Date.now() - accountObservation.at < 1000 && accountObservation.id === expected) return expected;
    if (!meRequest) {
      const pending = api('/i/users/me'); meRequest = pending;
      pending.then(() => { if (meRequest === pending) meRequest = null; }, () => { if (meRequest === pending) meRequest = null; });
    }
    const me = await meRequest;
    let id;
    try { id = Q.account(me); } catch (error) {
      loggedIn = false;
      accountObservation = null;
      log('AUTH_RESPONSE_REJECTED', {code: error.message, response: lastResponse});
      throw fail(error.message);
    }
    if (expected && id !== expected) { loggedIn = false; accountObservation = null; throw fail('accountChanged'); }
    accountObservation = {id, at: Date.now()};
    loggedIn = true; return id;
  }
  async function refreshTotal(force = false) {
    if (!force && Date.now() - lastTotalCheck < 60000) return;
    lastTotalCheck = Date.now();
    try {
      const data = await api('/i/listings/search?seller=Quixel%20Megascans&count=0&aggregate_on=listing_type');
      const value = Q.catalogTotal(data);
      if (value === null) throw fail('schema');
      total = value; totalUpdated = Date.now(); totalFresh = true;
      await chrome.storage.local.set({qmCatalogTotal: {value: total, updated: totalUpdated}});
      log('CATALOG_TOTAL', {value: total, source: 'server_aggregation'});
    } catch (error) {
      totalFresh = false;
      log('CATALOG_TOTAL_ERROR', {code: error.code || 'storageError', response: lastResponse});
      if (['paused', 'rateStopped', 'loginRequired', 'forbidden'].includes(error.code)) throw error;
      // An unavailable count must not prevent scanning or turn an unknown total into zero.
    }
    render();
  }
  async function loadAccount(id) {
    accountId = id; prefix = `qm:${id}:`;
    ownershipObservations.clear();
    const all = await chrome.storage.local.get(null);
    const savedLibrary = all[`${prefix}library`];
    libraryIds = savedLibrary?.source === 'fab_library' && Array.isArray(savedLibrary.ids) &&
      savedLibrary.ids.every(uid => typeof uid === 'string' && /^[a-f\d-]{36}$/i.test(uid)) ? new Set(savedLibrary.ids) : null;
    libraryUpdated = libraryIds === null ? 0 : savedLibrary.updated || 0; libraryFresh = false;
    meta = all[`${prefix}meta`] || {cursor: null, complete: false, pages: 0, seen: []};
    items = new Map(Object.entries(all).filter(([key]) => key.startsWith(`${prefix}item:`)).map(([, item]) => [item.uid, item]));
    const merged = [...(all[`${prefix}logs`] || []), ...logs];
    logs = [...new Map(merged.map(entry => [JSON.stringify(entry), entry])).values()].slice(-200);
    if (!meta.taskMode) {
      const previous = [...logs].reverse().find(entry => entry.event === 'START' && ['run', 'scan'].includes(entry.details?.mode));
      meta.taskMode = ['claim', 'stream'].includes(meta.phase) ? 'run' : previous?.details?.mode;
    }
    if (meta.canResume === undefined) meta.canResume = ['scan', 'claim', 'stream'].includes(meta.phase) && !!meta.taskMode;
    backoffInterval = Q.rateFloor(meta);
    // Legacy claim throttles can be recovered only when a real rate-limit event was retained.
    if (!Object.hasOwn(meta, 'backoffInterval') && logs.some(entry => entry.event === 'RATE_LIMIT') && meta.effective >= 1000) {
      backoffInterval = Math.max(backoffInterval, Math.min(60000, meta.effective));
    }
    effective = requestGap(); cooldown = meta.cooldown || 0; official = meta.official ?? null;
    await syncRateSetting(meta.rateAdjustment?.http);
    await saveMeta();
  }
  async function refreshLibrary() {
    meta.phase = 'library'; meta.libraryRefreshPending = true; await saveMeta();
    libraryFresh = false;
    const ids = new Set(), cursors = new Set(), signatures = new Set();
    let cursor = null, pages = 0;
    log('LIBRARY_REFRESH_START'); status('updatingLibrary', 0, 0);
    do {
      checkStop(); await verify(accountId, true);
      const params = new URLSearchParams(); if (cursor) params.set('cursor', cursor);
      const response = await api(`/i/library/search${cursor ? `?${params}` : ''}`);
      let page;
      try { page = Q.libraryPage(response); } catch { throw fail('schema'); }
      const signature = [...page.assets].sort().join(',');
      if ((page.next && (page.next === cursor || cursors.has(page.next))) ||
        (!page.assets.length && page.next) || (signature && signatures.has(signature))) throw fail('cursorLoop');
      if (signature) signatures.add(signature);
      for (const uid of page.owned) ids.add(uid);
      pages++; status('updatingLibrary', pages, ids.size);
      cursor = page.next; if (cursor) cursors.add(cursor);
    } while (cursor !== null);
    // A partial or interrupted enumeration must never replace a complete snapshot.
    checkStop(); await verify(accountId);
    const updated = Date.now();
    await chrome.storage.local.set({[`${prefix}library`]: {ids: [...ids], updated, source: 'fab_library'}});
    libraryIds = ids; libraryUpdated = updated; libraryFresh = true;
    const updates = {};
    for (const item of items.values()) {
      if (ids.has(item.uid)) { item.state = 'owned'; item.reason = ''; item.scanPending = false; }
      else if (item.state === 'owned') { item.state = 'unknown'; item.reason = 'unknownPrice'; }
      else continue;
      item.updated = updated; updates[`${prefix}item:${item.uid}`] = {...item};
    }
    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    meta.libraryRefreshPending = false; await saveMeta();
    log('LIBRARY_REFRESH_END', {owned: ids.size, pages}); render();
  }
  async function saveMeta() {
    if (!prefix) return;
    meta.effective = effective; meta.cooldown = cooldown; meta.official = official;
    meta.backoffInterval = backoffInterval; delete meta.scanEffective;
    await chrome.storage.local.set({[`${prefix}meta`]: structuredClone(meta), [`${prefix}logs`]: logs.slice(-200)});
  }
  async function saveItem(item) {
    item.updated = Date.now();
    await chrome.storage.local.set({[`${prefix}item:${item.uid}`]: {...item}});
    render();
  }
  const fatalCodes = new Set(['loginRequired', 'forbidden', 'csrfMissing', 'accountChanged', 'schema', 'sellerMismatch', 'rateStopped']);
  async function scanPage(rawItems, protectedIds = null) {
    for (let offset = 0; offset < rawItems.length; offset += 24) {
      checkStop();
      const chunk = rawItems.slice(offset, offset + 24), ids = chunk.map(item => item.uid);
      let states;
      if (meta.batchStates !== 'single') {
        const params = new URLSearchParams();
        for (const id of [...ids].sort()) params.append('listingIds', id);
        try {
          const response = await api(`/i/users/me/listings-states?${params}`);
          try { states = Q.batchStates(response, ids); } catch { throw fail('schema'); }
        } catch (error) {
          if (!(error.code === 'schema' || [404, 405].includes(error.status))) throw error;
          meta.batchStates = 'single';
          log('BATCH_STATES_FALLBACK', {code: error.code, response: lastResponse});
          await saveMeta();
        }
      }
      if (!states) {
        // Compatibility fallback: never infer ownership from missing batch rows.
        states = new Map(); let index = 0;
        const workers = Array.from({length: Math.min(4, ids.length)}, async () => {
          while (index < ids.length) {
            const id = ids[index++];
            states.set(id, await api(`/i/users/me/listings-states/${id}`));
          }
        });
        const results = await Promise.allSettled(workers);
        const rejected = results.find(result => result.status === 'rejected');
        if (rejected) throw rejected.reason;
      }
      const updates = {};
      for (const raw of chunk) {
        if (protectedIds?.has(raw.uid)) continue;
        const item = items.get(raw.uid);
        try {
          const state = states.get(item.uid);
          item.state = Q.scanState(raw.startingPrice?.price, state);
          ownershipObservations.set(item.uid, {owned: Q.ownership(state), at: Date.now()});
        }
        catch { throw fail('schema'); }
        item.scanPending = false;
        item.reason = item.state === 'skipped' ? 'noFreeOffer' : item.state === 'unknown' ? 'unknownPrice' : '';
        item.policy = 'free-auto-v1'; item.updated = Date.now();
        updates[`${prefix}item:${item.uid}`] = {...item};
      }
      if (Object.keys(updates).length) await chrome.storage.local.set(updates);
      render();
    }
  }
  async function processItem(item, claim) {
    try {
      checkStop();
      let owned;
      const recent = ownershipObservations.get(item.uid);
      if (recent && Date.now() - recent.at < OWNERSHIP_TTL) owned = recent.owned;
      else {
        const state = await api(`/i/users/me/listings-states/${item.uid}`);
        try { owned = Q.ownership(state); } catch { throw fail('schema'); }
      }
      item.scanPending = false;
      if (owned) { item.state = 'owned'; item.reason = ''; await saveItem(item); return 'alreadyOwned'; }
      const detail = await api(`/i/listings/${item.uid}`);
      if (detail?.uid !== item.uid || detail?.user?.uid !== Q.SELLER) throw fail('sellerMismatch');
      if (!Array.isArray(detail.licenses)) throw fail('schema');
      const offer = Q.freeOffer(detail);
      if (!offer && detail.licenses.some(l => typeof l.priceTier?.price !== 'number' || !Number.isFinite(l.priceTier.price))) throw fail('schema');
      item.policy = 'free-auto-v1'; delete item.license;
      if (!offer) { item.state = 'skipped'; item.reason = 'noFreeOffer'; await saveItem(item); return 'skipped'; }
      item.offerSlug = offer.slug || '';
      item.state = 'pending'; item.reason = '';
      await saveItem(item);
      if (!claim) return;
      // A live account check before each write also detects account changes during long runs.
      await verify(accountId);
      checkStop();
      await api(`/i/listings/${item.uid}/add-to-library`, 'POST', offer.offerId);
      const after = await api(`/i/users/me/listings-states/${item.uid}`);
      try { owned = Q.ownership(after); } catch { throw fail('schema'); }
      if (!owned) throw fail('uncertain');
      item.state = 'owned'; item.reason = ''; log('CLAIMED', item.uid); await saveItem(item); return 'claimed';
    } catch (error) {
      const code = error.code || error.message || 'network';
      if (code === 'paused') return 'paused';
      ownershipObservations.delete(item.uid);
      item.scanPending = false;
      if (fatalCodes.has(code) || !error.code) stopping = true;
      item.state = 'failed'; item.reason = `${code}${error.status ? ` (${error.status})` : ''}`;
      log('ITEM_ERROR', {uid: item.uid, code, http: error.status || 0});
      // Storage errors must stop work: continuing without durable checkpoints loses progress.
      try { await saveItem(item); } catch { stopping = true; throw fail('storageError'); }
      if (fatalCodes.has(code) || !error.code) { stopping = true; throw fail(error.code ? code : 'storageError'); }
      return 'failed';
    }
  }
  async function scanCatalog(onChunk, processed, claimQueued) {
    while (!meta.complete) {
      checkStop(); await verify(accountId, true);
      const params = new URLSearchParams({seller: 'Quixel Megascans', sort_by: '-createdAt'});
      if (meta.cursor) params.set('cursor', meta.cursor);
      const response = await api(`/i/listings/search?${params}`);
      let page;
      try { page = Q.page(response); } catch (error) { throw fail(error.message); }
      if (page.next !== null && (page.next === meta.cursor || meta.seen.includes(page.next))) throw fail('cursorLoop');
      if (!page.items.length && page.next) throw fail('cursorLoop');
      const signature = page.items.map(item => item.uid).sort().join(',');
      if (signature && meta.signatures?.includes(signature)) throw fail('cursorLoop');
      checkStop();
      const updates = {}, discovered = [];
      for (const raw of page.items) {
        const item = items.get(raw.uid) || {uid: raw.uid, title: raw.title || raw.uid, state: 'unknown', reason: ''};
        item.scanPrice = Number.isFinite(raw.startingPrice?.price) ? raw.startingPrice.price : null;
        item.scanPending = !processed.has(raw.uid) && !claimQueued.has(raw.uid);
        items.set(item.uid, item); updates[`${prefix}item:${item.uid}`] = {...item};
        discovered.push(item);
      }
      if (Object.keys(updates).length) await chrome.storage.local.set(updates);
      render();
      onChunk(discovered);
      // Persist unresolved discovery records before advancing: verification resumes from scanPending.
      checkStop();
      meta.signatures = [...(meta.signatures || []), signature].slice(-8);
      meta.pages++; if (meta.cursor) meta.seen.push(meta.cursor);
      meta.cursor = page.next; meta.complete = page.next === null;
      await saveMeta(); render();
    }
  }
  async function runTogether(claim) {
    const queue = [], queued = new Set(), processed = new Set();
    const checks = [], checksQueued = new Set();
    let index = 0, checkIndex = 0, producerDone = false, checkingLeft = CHECK_WORKERS, jobError = null;
    let waiters = [];
    const wake = () => { const pending = waiters; waiters = []; for (const resolve of pending) resolve(); };
    wakeJob = wake;
    const enqueue = entries => {
      if (!claim) return;
      for (const item of entries) if (!processed.has(item.uid) && !queued.has(item.uid) &&
        ['unknown', 'pending', 'failed'].includes(item.state)) {
        queued.add(item.uid); queue.push(item);
      }
      wake();
    };
    const enqueueChecks = entries => {
      for (const item of entries) if (item.scanPending && !processed.has(item.uid) && !queued.has(item.uid) && !checksQueued.has(item.uid)) {
        checksQueued.add(item.uid); checks.push(item.uid);
      }
      wake();
    };
    const guard = async task => {
      try { await task(); } catch (error) {
        // A fatal worker error must not be hidden by other workers subsequently stopping.
        if (!jobError || (jobError.code === 'paused' && error.code !== 'paused')) jobError = error;
        stopping = true; wake(); wakeReads();
      }
    };
    for (const item of items.values()) {
      if (item.scanPending) enqueueChecks([item]); else enqueue([item]);
    }
    // One batch owns up to N tasks. Finish every task (including confirmation),
    // then wait M before starting another batch; discovery/checkers stay independent.
    const workers = claim ? [guard(async () => {
      while (true) {
        checkStop();
        if (index < queue.length) {
          while (meta.lastBatchCompletedAt && Date.now() < meta.lastBatchCompletedAt + requestGap()) {
            checkStop();
            await sleep(Math.min(200, meta.lastBatchCompletedAt + requestGap() - Date.now()));
          }
          checkStop();
          const batch = [];
          while (index < queue.length && batch.length < config.concurrency) {
            const item = queue[index++]; queued.delete(item.uid);
            if (processed.has(item.uid) || !['unknown', 'pending', 'failed'].includes(item.state)) continue;
            processed.add(item.uid); batch.push(item);
          }
          if (!batch.length) continue;
          log('BATCH_START', {count: batch.length, ids: batch.map(item => item.uid), startedAt: Date.now(), config: {...config}});
          const outcomes = {claimed: 0, alreadyOwned: 0, skipped: 0, failed: 0, paused: 0};
          await Promise.all(batch.map(item => guard(async () => {
            try { const outcome = await processItem(item, true); outcomes[outcome]++; }
            catch (error) { outcomes.failed++; throw error; }
          })));
          meta.lastBatchCompletedAt = Date.now();
          log('BATCH_END', {count: batch.length, completedAt: meta.lastBatchCompletedAt, interval: requestGap(), outcomes});
          await saveMeta();
          checkStop();
        } else if (producerDone && checkingLeft === 0) return;
        else await new Promise(resolve => waiters.push(resolve));
      }
    })] : [];
    const checkers = Array.from({length: CHECK_WORKERS}, () => guard(async () => {
      try {
        while (true) {
          checkStop();
          if (checkIndex < checks.length) {
            const ids = checks.slice(checkIndex, checkIndex + 24); checkIndex += ids.length;
            const pending = ids.filter(id => !processed.has(id) && !queued.has(id));
            const rows = pending.map(id => ({uid: id, startingPrice: {price: items.get(id).scanPrice}}));
            await scanPage(rows, processed);
            for (const id of ids) checksQueued.delete(id);
            enqueue(pending.map(id => items.get(id)));
          } else if (producerDone) return;
          else await new Promise(resolve => waiters.push(resolve));
        }
      } finally { checkingLeft--; wake(); }
    }));
    const producer = guard(async () => {
      try { await scanCatalog(enqueueChecks, processed, queued); }
      finally { producerDone = true; wake(); }
    });
    await Promise.all([producer, ...checkers, ...workers]);
    wakeJob = () => {};
    if (jobError) throw jobError;
    checkStop();
  }
  async function work(mode) {
    running = true; stopping = false; render();
    let paused = false;
    try {
      config = Q.settings({concurrency: $('concurrency').value, interval: $('interval').value});
      showSettings(); effective = requestGap();
      await chrome.storage.local.set({qmSettings: config});
      const id = await verify(); await loadAccount(id);
      if (mode === 'resume') {
        if (!meta.canResume || !['run', 'scan'].includes(meta.taskMode)) { status('nothingToResume'); return; }
        mode = meta.taskMode;
      } else if (meta.complete && !meta.canResume && (mode === 'scan' || meta.taskMode === 'run')) {
        // Starting a completed task again refreshes the catalog through the existing main buttons.
        meta = {...meta, cursor: null, complete: false, pages: 0, seen: [], signatures: [], phase: 'scan'};
      }
      meta.taskMode = mode; meta.canResume = true; await saveMeta();
      status('preparing');
      await refreshTotal(true);
      log('START', {mode, version: chrome.runtime.getManifest().version, config});
      const ownedIds = new Set([...(libraryIds || []),
        ...[...items.values()].filter(item => item.state === 'owned').map(item => item.uid)]);
      if (libraryIds === null || ownedIds.size === 0 || meta.libraryRefreshPending || meta.phase === 'library') {
        await refreshLibrary();
      } else {
        log('LIBRARY_REUSED', {owned: ownedIds.size, updated: libraryUpdated});
      }
      // Recheck assets skipped under the old user-selected license policy.
      for (const item of items.values()) if (item.state === 'skipped' && item.policy !== 'free-auto-v1') {
        item.state = 'unknown'; await saveItem(item);
      }
      const claim = mode === 'run';
      meta.phase = claim ? 'stream' : 'scan'; await saveMeta();
      status(claim ? 'scanAndClaim' : 'scanning');
      await runTogether(claim);
      checkStop();
      const unresolved = [...items.values()].some(i => ['failed', 'unknown', 'pending'].includes(i.state));
      meta.phase = 'ready'; meta.canResume = claim && unresolved; await saveMeta();
      status(unresolved ? (claim ? 'finishedErrors' : 'scanFinished') : 'finished');
      log('END', {pages: meta.pages, scanned: items.size});
    } catch (error) {
      stopping = true;
      const code = error.code || 'storageError';
      paused = code === 'paused';
      status(paused ? 'pausing' : 'errorStatus', t(code), error.status || '');
      log('STOP', {code, http: error.status || 0, response: lastResponse});
    } finally {
      wakeJob(); wakeJob = () => {}; wakeReads();
      let saved = true;
      try { await saveMeta(); } catch { saved = false; status('errorStatus', t('storageError'), ''); }
      await diagnosticTail;
      running = false; stopping = false;
      if (paused && saved) status('paused'); else render();
    }
  }
  async function start(mode) {
    if (running) return;
    if (!['run', 'scan', 'resume'].includes(mode)) return;
    if (!Q.isTarget(location.href)) { status('wrongPage'); return; }
    // Browser-managed lock releases automatically on tab close/reload/crash.
    await navigator.locks.request('THS-QiMegaClaim-v1', {ifAvailable: true}, async lock => {
      if (!lock) { status('otherTab'); return; }
      await work(mode);
    });
  }
  for (const mode of ['run', 'scan', 'resume']) $(mode).addEventListener('click', () =>
    start(mode).catch(() => status('errorStatus', t('network'), '')));
  $('pause').addEventListener('click', () => { stopping = true; wakeJob(); wakeReads(); status('pausing'); });
  async function checkLogin(automatic = false) {
    if (running || checkingLogin || !Q.isTarget(location.href)) return;
    if (automatic && (Date.now() - lastAuthCheck < 2000 || Date.now() < cooldown)) return;
    lastAuthCheck = Date.now();
    try {
      await navigator.locks.request('THS-QiMegaClaim-v1', {ifAvailable: true}, async lock => {
        if (!lock) { if (!automatic) status('otherTab'); return; }
        running = true; checkingLogin = true; render();
        try {
          const previous = accountId, wasLoggedIn = loggedIn;
          stopping = false; effective = requestGap();
          const id = await verify();
          const authResponse = lastResponse;
          if (id !== accountId) await loadAccount(id);
          await refreshTotal();
          if (!automatic || !wasLoggedIn || previous !== id) {
            log('LOGIN_CONFIRMED', {automatic, response: authResponse}); status('ready');
          }
        } catch (error) {
          loggedIn = false;
          const code = error.code || 'storageError';
          log('LOGIN_ERROR', {code, automatic, response: lastResponse});
          if (code === 'loginRequired') { accountId = null; prefix = ''; items = new Map(); meta = {};
            libraryIds = null; libraryUpdated = 0; libraryFresh = false; status('loginRequired'); }
          else status('errorStatus', t(code), '');
          if (code === 'loginRequired') {
            try { await refreshTotal(); } catch { /* Login state remains unverified; diagnostics retain the count failure. */ }
          }
        } finally {
          await diagnosticTail;
          running = false; checkingLogin = false; render();
        }
      });
    } catch { status('errorStatus', t('network'), ''); }
  }
  $('login').addEventListener('click', () => checkLogin(false));
  window.addEventListener('focus', () => { if (initialized) checkLogin(true); });
  document.addEventListener('visibilitychange', () => {
    if (initialized && document.visibilityState === 'visible') checkLogin(true);
  });
  for (const key of ['concurrency', 'interval']) $(key).addEventListener('change', async () => {
    config = Q.settings({concurrency: $('concurrency').value, interval: $('interval').value});
    showSettings(); effective = requestGap(); render();
    try { await chrome.storage.local.set({qmSettings: config}); await saveMeta(); }
    catch { status('errorStatus', t('storageError'), ''); }
  });
  $('helpBtn').addEventListener('click', () => { $('help').showModal(); $('helpBtn').setAttribute('aria-expanded', 'true'); });
  $('helpClose').addEventListener('click', () => $('help').close());
  $('help').addEventListener('close', () => $('helpBtn').setAttribute('aria-expanded', 'false'));
  function resize() { spacer.style.height = hidden ? '0px' : `${host.getBoundingClientRect().height}px`; }
  $('hide').addEventListener('click', () => { hidden = true; $('bar').hidden = true; $('mini').hidden = false; resize(); });
  $('mini').addEventListener('click', () => { hidden = false; $('bar').hidden = false; $('mini').hidden = true; resize(); });
  globalThis.__qiMegaShow = () => {
    hidden = false; $('bar').hidden = false; $('mini').hidden = true; route(); resize();
  };
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({version: chrome.runtime.getManifest().version,
      exported: new Date().toISOString(), config, meta, status: {code: statusKey, args: statusArgs, loggedIn},
      catalog: {total, updated: totalUpdated, fresh: totalFresh},
      library: {ids: libraryIds === null ? null : [...libraryIds], updated: libraryUpdated, fresh: libraryFresh},
      lastResponse, items: [...items.values()], logs}, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `QiMegaClaim-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  const spacer = document.createElement('div'); spacer.id = 'ths-qimega-spacer'; spacer.setAttribute('aria-hidden', 'true');
  new ResizeObserver(resize).observe(host);
  function route() {
    const target = Q.isTarget(location.href);
    if (target && !mounted) { document.body.append(spacer, host); mounted = true; resize(); }
    if (!target && mounted) { stopping = running; wakeJob(); wakeReads(); host.remove(); spacer.remove(); mounted = false; }
    if (mounted && running) render();
    if (initialized && target && !running && document.visibilityState !== 'hidden' && Date.now() - lastAuthCheck >= 30000) checkLogin(true);
  }
  // Fab uses client-side navigation; no page-world history hooks are needed.
  setInterval(route, 1000);
  chrome.storage.local.get(null).then(data => {
    logs = data.qmDiagnostics || [];
    if (Number.isSafeInteger(data.qmCatalogTotal?.value) && data.qmCatalogTotal.value >= 0) {
      total = data.qmCatalogTotal.value; totalUpdated = data.qmCatalogTotal.updated || 0;
    }
    config = Q.settings(data.qmSettings); effective = config.interval; showSettings(); route(); render();
    log('BOOT', {version: chrome.runtime.getManifest().version, language: chrome.i18n.getUILanguage()});
    // Read-only login check; installation never starts scanning/claiming automatically.
    initialized = true;
    if (mounted) checkLogin(true);
  }).catch(() => { showSettings(); route(); status('errorStatus', t('storageError'), ''); });
})();
