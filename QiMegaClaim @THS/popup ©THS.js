'use strict';
document.documentElement.lang = chrome.i18n.getUILanguage();
document.getElementById('intro').textContent = chrome.i18n.getMessage('popupIntro');
document.getElementById('open').textContent = chrome.i18n.getMessage('openFab');
document.getElementById('open').addEventListener('click', async () => {
  const button = document.getElementById('open');
  button.disabled = true;
  try {
    const tabs = await chrome.tabs.query({url: 'https://www.fab.com/*'});
    const target = tabs.find(tab => QiMega.isTarget(tab.url));
    if (target) {
      // Existing tabs predate installation and may have no content script yet.
      await chrome.scripting.executeScript({target: {tabId: target.id, frameIds: [0]},
        world: 'ISOLATED', files: ['core.js', 'content ©THS.js']});
      await chrome.tabs.update(target.id, {active: true});
      await chrome.windows.update(target.windowId, {focused: true});
      console.log('[QiMegaClaim]', 'PANEL_ACTIVATED');
    } else await chrome.tabs.create({url: QiMega.TARGET});
    window.close();
  } catch (error) {
    console.warn('[QiMegaClaim]', 'PANEL_ACTIVATION_ERROR', error.message);
    document.getElementById('intro').textContent = chrome.i18n.getMessage('network');
  } finally { button.disabled = false; }
});
