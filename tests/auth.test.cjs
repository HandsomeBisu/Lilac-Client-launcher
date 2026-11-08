const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto');
const { startLoopback } = require('../electron/auth/loopback.cjs');
const { SecureVault } = require('../electron/auth/vault.cjs');
const { AuthService } = require('../electron/auth/service.cjs');
const { AuthError, publicError } = require('../electron/auth/errors.cjs');
const { validateClientId } = require('../electron/auth/config.cjs');
const ID = '12345678-1234-4321-abcd-123456789abc';
const account = { homeAccountId: 'home-id', name: 'Test User', username: 'test@example.invalid' };
function postCallback(uri, payload, {method = 'POST', host} = {}) {
  const url = new URL(uri); const body = new URLSearchParams(payload).toString();
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port: url.port, path: '/', method, headers: { Host: host || url.host, 'Content-Type': 'application/x-www-form-urlencoded' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.end(method === 'POST' ? body : undefined);
  });
}
test('OAuth callback rejects wrong/duplicate state, query-style response and foreign host without ending login', {timeout:5000}, async () => {
  const controller = new AbortController();
  const listener = await startLoopback({ state: 'expected', signal: controller.signal });
  try {
    assert.equal(await postCallback(listener.redirectUri, {state:'wrong',code:'secret'}), 400);
    assert.equal(await postCallback(listener.redirectUri, [['state','expected'],['state','expected'],['code','secret']]), 400);
    assert.equal(await postCallback(listener.redirectUri, {state:'expected',code:'secret'}, {method:'GET'}), 405);
    assert.equal(await postCallback(listener.redirectUri, {state:'expected',code:'secret'}, {host:'evil.example'}), 400);
    assert.equal(await postCallback(listener.redirectUri, {state:'expected',code:'secret'}), 200);
    assert.deepEqual(await listener.response, {code:'secret'});
    await assert.rejects(postCallback(listener.redirectUri, {state:'expected',code:'secret'}));
  } finally { listener.close(); }
});
test('callback cancellation and timeout release the loopback listener', {timeout:5000}, async () => {
  const controller = new AbortController();
  const listener = await startLoopback({ state:'expected', signal:controller.signal });
  controller.abort();
  await assert.rejects(listener.response, {code:'cancelled'});
  await assert.rejects(postCallback(listener.redirectUri, {state:'expected',code:'secret'}));
  const timed = await startLoopback({state:'expected',timeoutMs:20});
  await assert.rejects(timed.response, {code:'login_timeout'});
});
test('vault encrypts on disk, restores values, fails closed and deletes login data', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lilac-auth-vault-'));
  const key = randomBytes(32);
  let available = true;
  const crypto = {
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async value => { const iv=randomBytes(12); const cipher=createCipheriv('aes-256-gcm',key,iv); const encrypted=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]); return Buffer.concat([iv,cipher.getAuthTag(),encrypted]); },
    decryptStringAsync: async bytes => { const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12)); decipher.setAuthTag(bytes.subarray(12,28)); return {result:Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString()}; }
  };
  const file=path.join(dir,'cache.bin'); const vault=new SecureVault(file,crypto);
  try {
    await vault.write({cache:'sensitive-refresh-token', clientId:ID});
    assert.equal((await fs.readFile(file)).includes(Buffer.from('sensitive-refresh-token')),false);
    assert.equal((await vault.read()).cache,'sensitive-refresh-token');
    available=false;
    await assert.rejects(vault.write({cache:'replacement'}),{code:'secure_storage_unavailable'});
    available=true;
    await fs.writeFile(file, 'corrupt');
    await assert.rejects(vault.read(),{code:'cache_decryption_failed'});
    await vault.clear(); assert.equal(await vault.read(),null);
  } finally {await vault.clear(); await fs.rmdir(dir);}
});
async function serviceFixture(t, options = {}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lilac-auth-service-'));
  const file=path.join(dir,'config.json'); await fs.writeFile(file,JSON.stringify({clientId:ID}));
  t.after(async () => {await fs.rm(file,{force:true});await fs.rmdir(dir);});
  let cacheValue=null; let authRequest, tokenRequest; let opened=0;
  const vault = {check:async()=>{},read:async()=>cacheValue,write:async value=>{cacheValue=value;},clear:async()=>{cacheValue=null;}};
  const pca = {
    getAuthCodeUrl:async request=>{authRequest=request;return 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';},
    acquireTokenByCode:async request=>{tokenRequest=request;return {account,accessToken:'microsoft-secret'};},
    acquireTokenSilent:async()=>({account,accessToken:'refreshed-ms-secret'}),
    getTokenCache:()=>({serialize:()=>JSON.stringify({refreshToken:'private-refresh-secret'}),deserialize:()=>{},getAllAccounts:async()=>[account]})
  };
  const verify = async()=>({accessToken:'minecraft-secret',expiresAt:Date.now()+3600000,profile:{id:'a'.repeat(32),name:'LilacTest',skinDataUrl:null}});
  const service=new AuthService({configFile:file,vault,openBrowser:async()=>{opened++;},pcaFactory:()=>pca,verify,loopback:async()=>({redirectUri:'http://localhost:4567/',response:Promise.resolve({code:'authorization-code'}),close:()=>{}}),...options});
  await service.ready;
  return {service,pca,vault,requests:()=>({authRequest,tokenRequest,opened}),cached:()=>cacheValue};
}
test('PKCE, nonce and browser login produce a private Minecraft session; IPC snapshot contains no tokens',async t=>{
  const f=await serviceFixture(t);
  const state=await f.service.login();
  assert.equal(state.signedIn,true);assert.equal(state.minecraft.verified,true);assert.equal(state.minecraft.profile.name,'LilacTest');
  const {authRequest,tokenRequest,opened}=f.requests();
  assert.equal(opened,1);assert.equal(authRequest.codeChallengeMethod,'S256');assert.equal(authRequest.responseMode,'form_post');
  assert.equal(createHash(tokenRequest.codeVerifier),authRequest.codeChallenge);assert.equal(authRequest.nonce,tokenRequest.nonce);
  const json=JSON.stringify(state);for(const token of [ID,'microsoft-secret','minecraft-secret','private-refresh-secret','authorization-code'])assert.equal(json.includes(token),false);
  assert.equal(Object.hasOwn(state,'clientId'),false);assert.equal(Object.hasOwn(state,'configSource'),false);
  assert.equal(f.service.getGameSession().accessToken,'minecraft-secret');
  await f.service.logout();assert.equal(f.cached(),null);assert.equal(f.service.snapshot().signedIn,false);assert.equal(f.service.getGameSession(),null);
});
function createHash(value){return require('node:crypto').createHash('sha256').update(value).digest('base64url');}
test('Minecraft 403 preserves Microsoft login and reports API access separately',async t=>{
  const f=await serviceFixture(t,{verify:async()=>{throw new AuthError('minecraft_app_access','API access denied');}});
  const result=await f.service.login();assert.equal(result.signedIn,true);assert.equal(result.minecraft.verified,false);assert.equal(result.minecraft.error.code,'minecraft_app_access');assert.equal(f.service.getGameSession(),null);
});
test('silent refresh restores account without opening a browser',async t=>{
  const f=await serviceFixture(t);await f.service.login();
  const second=new AuthService({configFile:f.service.configFile,vault:f.vault,openBrowser:async()=>{throw new Error('must not open');},pcaFactory:()=>f.pca,verify:async()=>({accessToken:'new-private-token',expiresAt:Date.now()+60000,profile:{id:'a'.repeat(32),name:'LilacTest'}})});
  await second.ready;assert.equal(second.snapshot().signedIn,true);assert.equal(second.snapshot().minecraft.verified,false);
  await second.refresh();assert.equal(second.snapshot().minecraft.verified,true);
});
test('concurrent login is blocked and logout cancels in-flight verification without restoring session',async t=>{
  let started; const signalReady=new Promise(resolve=>{started=resolve;});
  const f=await serviceFixture(t,{verify:async(_token,{signal})=>{started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  const login=f.service.login();await signalReady;
  await assert.rejects(f.service.login(),{code:'busy'});
  await f.service.logout();await login;
  assert.equal(f.service.snapshot().signedIn,false);assert.equal(f.cached(),null);assert.equal(f.service.getGameSession(),null);
});
test('invalid app IDs and raw SDK errors do not leak into UI',()=>{
  assert.throws(()=>validateClientId('client-secret-value'),{code:'invalid_client_id'});
  const error=publicError(new Error('access_token=private-value'));
  assert.equal(JSON.stringify(error).includes('private-value'),false);
  assert.equal(publicError({errorCode:'invalid_grant'}).code,'sign_in_required');
});
test('changing app ID clears the previous login and returns an idle state',async t=>{
  const f=await serviceFixture(t);await f.service.login();
  const nextId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const state=await f.service.configure(nextId);
  assert.equal(f.service.config.clientId,nextId);assert.equal(Object.hasOwn(state,'clientId'),false);assert.equal(state.busy,false);assert.equal(state.signedIn,false);assert.equal(state.minecraft.verified,false);assert.equal(f.cached(),null);
});
test('expired silent refresh invalidates game readiness and requests a fresh sign-in',async t=>{
  const f=await serviceFixture(t);await f.service.login();
  f.pca.acquireTokenSilent=async()=>{throw {errorCode:'invalid_grant'};};
  const state=await f.service.refresh();
  assert.equal(state.error.code,'sign_in_required');assert.equal(state.minecraft.verified,false);assert.equal(f.service.getGameSession(),null);
});
