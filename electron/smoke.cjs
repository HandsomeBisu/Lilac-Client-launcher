const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { safeStorage, app } = require('electron');
const { SecureVault } = require('./auth/vault.cjs');

module.exports = async function smoke(win, auth) {
  const errors = [];
  const testVault = new SecureVault(path.join(app.getPath('userData'), 'encryption-test.bin'), safeStorage);
  await testVault.write({ cache: 'test-token-fixture', clientId: 'test' });
  assert.equal((await testVault.read()).cache, 'test-token-fixture');
  assert.equal((await fs.readFile(testVault.file)).includes(Buffer.from('test-token-fixture')), false);
  await testVault.clear();
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await win.webContents.executeJavaScript(`localStorage.removeItem('lilac.launcher.settings.v1')`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  const result = await win.webContents.executeJavaScript(`(async () => {
    const $ = selector => document.querySelector(selector);
    const click = selector => $(selector).click();
    localStorage.removeItem('lilac.launcher.settings.v1');
    click('[data-page="versions"]');
    const all = document.querySelectorAll('.version-card').length;
    click('[data-filter="Forge"]');
    const forge = document.querySelectorAll('.version-card').length;
    click('[data-choose="1.8.9"]');
    click('[data-favorite="1.8.9"]');
    click('[data-filter="favorites"]');
    const favorites = document.querySelectorAll('.version-card').length;
    click('[data-filter="all"]');
    $('#version-search').value = '1.21';
    $('#version-search').dispatchEvent(new Event('input'));
    const search = document.querySelectorAll('.version-card').length;
    click('[data-page="settings"]');
    $('#memory-slider').value = '8';
    $('#memory-slider').dispatchEvent(new Event('input'));
    $('#resolution-select').value = '1920x1080';
    $('#resolution-select').dispatchEvent(new Event('change'));
    const saved = JSON.parse(localStorage.getItem('lilac.launcher.settings.v1'));
    click('[data-page="home"]');
    click('#play-button');
    const launchNotice = $('#info-dialog').open && $('#info-message').textContent.includes('실행 기능이 아직 연결되지 않았습니다');
    click('#info-confirm');
    click('#version-picker');
    const quickCount = document.querySelectorAll('.quick-version').length;
    click('[data-quick="26.3"]');
    const quickSelection = $('#selected-version').textContent;
    click('#account-button');
    await new Promise(resolve => setTimeout(resolve, 100));
    const loginNotice = $('#auth-dialog').open;
    const missingAppId = !$('#auth-login').hidden && $('#auth-login').disabled && $('#auth-status').textContent.includes('최신 버전');
    const stateResponse = await window.lilacDesktop.auth.getState();
    const privateAuthState = !JSON.stringify(stateResponse).includes('accessToken') && !JSON.stringify(stateResponse).includes('refreshToken') && !Object.hasOwn(stateResponse.state,'clientId') && !Object.hasOwn(stateResponse.state,'configSource');
    const developerSettingsRemoved = !$('#auth-developer') && !$('#auth-client-id') && !window.lilacDesktop.auth.configure && !window.lilacDesktop.auth.help;
    click('#auth-dialog .close-dialog');
    const pinnedCount = document.querySelectorAll('[data-pinned]').length;
    click('[data-pinned="1.8.9"]');
    const pinnedSelection = $('#selected-version').textContent;
    click('#version-picker');
    click('[data-quick="26.3"]');
    return {all, forge, favorites, search, saved, launchNotice, quickCount, quickSelection, loginNotice, missingAppId, developerSettingsRemoved, privateAuthState, pinnedCount, pinnedSelection,
      detailMemory: $('#detail-memory').textContent, detailResolution: $('#detail-resolution').textContent,
      backgroundLoaded: $('#scene-image').complete && $('#scene-image').naturalWidth > 0,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth};
  })()`);
  assert.equal(result.all, 19);
  assert.equal(result.forge, 2);
  assert.equal(result.favorites, 1);
  assert.equal(result.search, 7);
  assert.equal(result.saved.version, '1.8.9');
  assert.equal(result.saved.memory, 8);
  assert.equal(result.saved.resolution, '1920x1080');
  assert.equal(result.launchNotice, true);
  assert.equal(result.quickCount, 19);
  assert.equal(result.quickSelection, '26.3');
  assert.equal(result.loginNotice, true);
  assert.equal(result.missingAppId, true);
  assert.equal(result.developerSettingsRemoved, true);
  assert.equal(result.privateAuthState, true);
  assert.equal(result.pinnedCount, 1);
  assert.equal(result.pinnedSelection, '1.8.9');
  assert.equal(result.detailMemory, '8 GB');
  assert.equal(result.detailResolution, '1920 × 1080');
  assert.equal(result.backgroundLoaded, true);
  assert.equal(result.horizontalOverflow, false);
  const testAuthState = { configured: true, busy: true, stage: 'browser', signedIn: false, account: null, minecraft: { verified: false, profile: null, error: null }, error: null };
  win.webContents.send('auth:changed', testAuthState);
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await win.webContents.executeJavaScript(`!document.querySelector('#auth-cancel').hidden && document.querySelector('#auth-login').hidden`), true);
  win.webContents.send('auth:changed', { ...testAuthState, busy: false, stage: 'idle', signedIn: true, account: {id:'escape-test'}, accounts:[{id:'escape-test',active:true,profile:{id:'a'.repeat(32),name:'<img src=x>',skinDataUrl:null}}], minecraft: { verified: true, error: null, profile: {id:'a'.repeat(32),name:'LilacTest',skinDataUrl:null} } });
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.deepEqual(await win.webContents.executeJavaScript(`({name:document.querySelector('#account-name').textContent,escaped:document.querySelector('.saved-account-text strong').textContent,injected:document.querySelector('#auth-account-list img[src="x"]')!==null,detailsRemoved:!document.querySelector('#auth-profile')&&!document.querySelector('.auth-security-note')})`), {name:'LilacTest',escaped:'<img src=x>',injected:false,detailsRemoved:true});
  // Reload validates actual browser storage and rehydration, not just a JSON round trip.
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  const reloaded = await win.webContents.executeJavaScript(`({ version: document.querySelector('#selected-version').textContent, memory: document.querySelector('#memory-slider').value })`);
  assert.equal(reloaded.version, '26.3');
  assert.equal(reloaded.memory, '8');
  await win.webContents.executeJavaScript(`localStorage.removeItem('lilac.launcher.settings.v1')`);
  await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.webContents.reload(); });
  await new Promise(resolve => setTimeout(resolve, 300));
  const dir = path.join(__dirname, '..', 'artifacts');
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'launcher-home.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#account-button').click()`);
  await new Promise(resolve => setTimeout(resolve, 370));
  await fs.writeFile(path.join(dir, 'launcher-account.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('#auth-dialog .close-dialog').click()`);
  await new Promise(resolve => setTimeout(resolve, 260));
  win.setSize(1000, 720);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(await win.webContents.executeJavaScript('document.documentElement.scrollWidth > innerWidth'), false);
  assert.equal(await win.webContents.executeJavaScript('document.querySelector("main").scrollWidth > document.querySelector("main").clientWidth'), false);
  await fs.writeFile(path.join(dir, 'launcher-compact.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[data-page="versions"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 260));
  await fs.writeFile(path.join(dir, 'launcher-versions.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('[data-page="settings"]').click()`);
  await new Promise(resolve => setTimeout(resolve, 260));
  await fs.writeFile(path.join(dir, 'launcher-settings.png'), (await win.webContents.capturePage()).toPNG());
  // Keep the real IPC and auth service; substitute only the identity provider in this isolated profile.
  let nextAccount = {homeAccountId:'smoke-a',name:'Lilac Developer',username:'lilac@example.invalid'};
  let cachedAccounts = [], browsers = 0, waitForBrowser = false;
  auth.pcaFactory = () => ({
    getTokenCache: () => ({
      serialize: () => JSON.stringify({accounts:cachedAccounts,privateToken:'smoke-refresh-fixture'}),
      deserialize: data => {cachedAccounts=JSON.parse(data).accounts||[];},
      getAllAccounts: async () => [...cachedAccounts],
      removeAccount: async account => {cachedAccounts=cachedAccounts.filter(item=>item.homeAccountId!==account.homeAccountId);}
    }),
    getAuthCodeUrl: async () => 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    acquireTokenByCode: async () => {if(!cachedAccounts.some(item=>item.homeAccountId===nextAccount.homeAccountId))cachedAccounts.push(nextAccount);return {account:nextAccount,accessToken:`smoke-ms:${nextAccount.homeAccountId}`};},
    acquireTokenSilent: async ({account}) => ({account,accessToken:`smoke-ms:${account.homeAccountId}`})
  });
  auth.loopback = async ({signal}) => ({redirectUri:'http://localhost:4567/',response:waitForBrowser ? new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})) : Promise.resolve({code:'smoke-code'}),close:()=>{}});
  auth.openBrowser = async () => {browsers++;};
  const fixtureSkins = await win.webContents.executeJavaScript(`['#986e52','#af855e'].map(color=>{const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(8,8,8,8);ctx.fillStyle='#40343c';ctx.fillRect(8,8,8,2);ctx.fillStyle='#e7e1ea';ctx.fillRect(9,12,2,1);ctx.fillRect(13,12,2,1);ctx.fillStyle='#6374a4';ctx.fillRect(10,12,1,1);ctx.fillRect(13,12,1,1);ctx.fillStyle='#765044';ctx.fillRect(11,14,2,1);return c.toDataURL('image/png');})`);
  auth.verify = async token => ({accessToken:'smoke-game-fixture',expiresAt:Date.now()+60000,profile:{id:(token.endsWith('smoke-a')?'a':'b').repeat(32),name:token.endsWith('smoke-a')?'LilacDev':'Builder',skinDataUrl:fixtureSkins[token.endsWith('smoke-a')?0:1]}});
  const configFile = auth.configFile;
  const waitUntil = async script => {
    for(let count=0;count<100;count++) {if(await win.webContents.executeJavaScript(script))return;await new Promise(resolve=>setTimeout(resolve,30));}
    throw new Error('UI condition timed out');
  };
  try {
    await auth.configure('12345678-1234-4321-abcd-123456789abc');
    await win.webContents.executeJavaScript(`document.querySelector('#account-button').click()`);
    await new Promise(resolve=>setTimeout(resolve,40));
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#auth-dialog').getAnimations().length>0`),true);
    await new Promise(resolve=>setTimeout(resolve,340));
    assert.equal(await win.webContents.executeJavaScript(`Math.abs(document.querySelector('#auth-dialog').getBoundingClientRect().right-innerWidth)<2`),true);
    await win.webContents.executeJavaScript(`document.querySelector('#auth-login').click()`);
    await waitUntil(`document.querySelector('#account-name').textContent==='LilacDev' && document.querySelector('#auth-cancel').hidden`);
    nextAccount={homeAccountId:'smoke-b',name:'Builder Account',username:'builder@example.invalid'};
    await win.webContents.executeJavaScript(`document.querySelector('#auth-login').click()`);
    await waitUntil(`document.querySelectorAll('[data-switch-account]').length===2 && document.querySelector('#account-name').textContent==='Builder'`);
    await waitUntil(`document.querySelectorAll('.saved-avatar canvas').length===2`);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#auth-dialog').textContent.includes('@') || document.querySelector('#auth-dialog').textContent.includes('Builder Account') || !!document.querySelector('.auth-security-note')`),false);
    assert.deepEqual(await win.webContents.executeJavaScript(`[...document.querySelectorAll('.saved-account-text strong')].map(el=>el.textContent)`),['LilacDev','Builder']);
    const staleState = {...auth.snapshot(),revision:0,busy:true,stage:'browser'};
    win.webContents.send('auth:changed',staleState);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#account-name').textContent`),'Builder');
    await win.webContents.executeJavaScript(`document.querySelector('[data-switch-account="smoke-a"]').click()`);
    await waitUntil(`document.querySelector('#account-name').textContent==='LilacDev' && document.querySelector('[data-switch-account="smoke-a"]').getAttribute('aria-pressed')==='true'`);
    assert.equal(browsers,2);
    waitForBrowser=true;
    await win.webContents.executeJavaScript(`document.querySelector('#auth-login').click()`);
    await waitUntil(`!document.querySelector('#auth-cancel').hidden`);
    await win.webContents.executeJavaScript(`document.querySelector('#auth-dialog .close-dialog').click()`);
    await waitUntil(`!document.querySelector('#auth-dialog').open && document.querySelector('#account-button').getAttribute('aria-expanded')==='false'`);
    assert.equal(auth.busy,true);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#account-button').getAttribute('aria-expanded')`),'false');
    await win.webContents.executeJavaScript(`document.querySelector('#account-button').click();document.querySelector('#auth-cancel').click()`);
    await waitUntil(`document.querySelector('#account-name').textContent==='LilacDev' && document.querySelectorAll('[data-switch-account]').length===2`);
    waitForBrowser=false;
    await new Promise(resolve=>setTimeout(resolve,370));
    await fs.writeFile(path.join(dir,'launcher-accounts.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('[data-remove-account="smoke-b"]').click()`);
    await waitUntil(`document.querySelectorAll('[data-switch-account]').length===1`);
    assert.equal(auth.account.homeAccountId,'smoke-a');
    // Reduced motion also bypasses JavaScript animations; closing still releases the modal and focus.
    await win.webContents.executeJavaScript(`document.querySelector('#motion-toggle').click();document.querySelector('#auth-dialog .close-dialog').click()`);
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.equal(await win.webContents.executeJavaScript(`!document.querySelector('#auth-dialog').open && !window.LilacMotion.enabled()`),true);
    assert.equal(await win.webContents.executeJavaScript(`document.querySelector('#account-button').getAttribute('aria-expanded')`),'false');
    await auth.logoutAll();
    await win.webContents.executeJavaScript(`document.querySelector('#motion-toggle').click()`);
  } finally {
    auth.cancel();if(auth.active)await auth.active;
    await auth.logoutAll();await fs.rm(configFile,{force:true});
  }
  assert.deepEqual(errors, []);
  console.log('PASS: catalog, settings, animated drawer, account addition/switch/removal through IPC, explicit cancellation, reduced motion, private state, Windows encrypted storage and compact layout.');
};
