const { PublicClientApplication, CryptoProvider } = require('@azure/msal-node');
const { randomBytes } = require('node:crypto');
const { AUTHORITY, SCOPES, loadConfig, saveConfig, validateClientId } = require('./config.cjs');
const { AuthError, publicError } = require('./errors.cjs');
const { startLoopback } = require('./loopback.cjs');
const { verifyMinecraft, limitedBytes } = require('./minecraft.cjs');

class AuthService {
  constructor({ configFile, envClientId, vault, openBrowser, publish = () => {}, pcaFactory, verify = verifyMinecraft, loopback = startLoopback }) {
    Object.assign(this, { configFile, envClientId, vault, openBrowser, publish, verify, loopback });
    this.pcaFactory = pcaFactory || (config => new PublicClientApplication(config));
    this.config = { clientId: null, source: 'none' };
    this.account = null; this.session = null; this.minecraftError = null; this.error = null;
    this.busy = false; this.stage = 'initializing'; this.active = null;
    this.ready = this.initialize();
  }
  snapshot() {
    return {
      configured: Boolean(this.config.clientId),
      busy: this.busy, stage: this.stage, signedIn: Boolean(this.account),
      account: this.account ? { name: this.account.name || this.account.username || 'Microsoft 계정', username: this.account.username || '' } : null,
      minecraft: { verified: Boolean(this.session && this.session.expiresAt > Date.now()), profile: this.session ? { id: this.session.profile.id, name: this.session.profile.name, skinDataUrl: this.session.profile.skinDataUrl || null } : null, error: this.minecraftError },
      error: this.error
    };
  }
  emit(stage) { if (stage) this.stage = stage; this.publish(this.snapshot()); }
  makePca() {
    const network = async (url, method, options) => {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'login.microsoftonline.com') throw new AuthError('invalid_authority', '허용되지 않은 Microsoft 인증 서버입니다.');
      const signals = [AbortSignal.timeout(20000)];
      if (this.controller) signals.push(this.controller.signal);
      const response = await fetch(url, { method, headers: options?.headers, body: method === 'POST' ? options?.body : undefined, redirect: 'error', signal: AbortSignal.any(signals) });
      return { status: response.status, headers: Object.fromEntries(response.headers), body: JSON.parse((await limitedBytes(response, 2 * 1024 * 1024)).toString('utf8')) };
    };
    this.pca = this.pcaFactory({
      auth: { clientId: this.config.clientId, authority: AUTHORITY },
      system: {
        loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
        networkClient: { sendGetRequestAsync: (url, options) => network(url, 'GET', options), sendPostRequestAsync: (url, options) => network(url, 'POST', options) }
      }
    });
  }
  async initialize() {
    try {
      this.config = await loadConfig(this.configFile, this.envClientId);
      if (this.config.clientId) {
        this.makePca();
        const cached = await this.vault.read();
        if (cached && cached.clientId === this.config.clientId) {
          this.pca.getTokenCache().deserialize(cached.cache);
          this.account = (await this.pca.getTokenCache().getAllAccounts()).find(item => item.homeAccountId === cached.accountId) || null;
        }
      }
    } catch (error) { this.error = publicError(error); }
    this.emit('idle');
  }
  async persist() {
    if (!this.account) return;
    await this.vault.write({ clientId: this.config.clientId, accountId: this.account.homeAccountId, cache: this.pca.getTokenCache().serialize() });
  }
  async configure(clientId) {
    await this.ready;
    if (this.busy) throw new AuthError('busy', '진행 중인 인증을 먼저 취소해 주세요.');
    if (this.envClientId) throw new AuthError('environment_config', '환경 변수 LILAC_MS_CLIENT_ID가 설정되어 있습니다. 해당 환경 변수에서 앱 ID를 변경해 주세요.');
    const normalizedId = validateClientId(clientId);
    if (normalizedId === this.config.clientId) return this.snapshot();
    this.busy = true; this.emit('configuring');
    try {
      await this.vault.clear();
      this.account = null; this.session = null; this.minecraftError = null;
      this.config = await saveConfig(this.configFile, clientId);
      this.makePca(); this.error = null;
    } finally { this.busy = false; this.emit('idle'); }
    return this.snapshot();
  }
  async login() { return this.run(true); }
  async refresh() { return this.run(false); }
  async run(interactive) {
    await this.ready;
    if (this.active || this.busy) throw new AuthError('busy', '이미 인증을 진행하고 있습니다.');
    if (!this.config.clientId) throw new AuthError('configuration_required', '이 버전에서는 로그인을 사용할 수 없습니다. 최신 버전을 확인하거나 배포자에게 문의해 주세요.');
    const controller = new AbortController();
    this.controller = controller;
    this.busy = true; this.error = null; this.minecraftError = null; this.session = null;
    this.emit(interactive ? 'browser' : 'restoring');
    const timer = setTimeout(() => controller.abort(new AuthError('login_timeout', '인증 시간이 초과되었습니다. 다시 시도해 주세요.')), 180000);
    this.active = (async () => {
      let listener;
      try {
        await this.vault.check();
        let result;
        if (interactive) {
          const crypto = new CryptoProvider();
          const { verifier, challenge } = await crypto.generatePkceCodes();
          const state = randomBytes(32).toString('base64url');
          const nonce = randomBytes(32).toString('base64url');
          listener = await this.loopback({ state, signal: controller.signal });
          const url = await this.pca.getAuthCodeUrl({ scopes: [...SCOPES], redirectUri: listener.redirectUri, codeChallenge: challenge, codeChallengeMethod: 'S256', responseMode: 'form_post', state, nonce, prompt: 'select_account' });
          const target = new URL(url);
          if (target.protocol !== 'https:' || target.hostname !== 'login.microsoftonline.com') throw new AuthError('invalid_authority', '허용되지 않은 로그인 주소입니다.');
          controller.signal.throwIfAborted();
          await this.openBrowser(url);
          const response = await listener.response;
          controller.signal.throwIfAborted();
          this.emit('microsoft');
          result = await this.pca.acquireTokenByCode({ code: response.code, scopes: [...SCOPES], redirectUri: listener.redirectUri, codeVerifier: verifier, nonce });
        } else {
          if (!this.account) throw new AuthError('sign_in_required', 'Microsoft 계정으로 로그인해 주세요.');
          result = await this.pca.acquireTokenSilent({ account: this.account, scopes: [...SCOPES] });
        }
        controller.signal.throwIfAborted();
        if (!result?.account || !result.accessToken) throw new AuthError('invalid_response', 'Microsoft 인증 응답에 계정 정보가 없습니다.');
        this.account = result.account;
        await this.persist();
        controller.signal.throwIfAborted();
        try {
          this.session = await this.verify(result.accessToken, { signal: controller.signal, progress: stage => this.emit(stage) });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          this.minecraftError = publicError(error);
        }
      } catch (error) {
        this.session = null;
        this.error = publicError(controller.signal.aborted ? controller.signal.reason : error);
        if (this.error.code === 'sign_in_required') this.minecraftError = this.error;
      } finally {
        listener?.close();
        clearTimeout(timer);
        this.busy = false; this.controller = null; this.active = null;
        this.emit('idle');
      }
      return this.snapshot();
    })();
    return this.active;
  }
  cancel() { this.controller?.abort(new AuthError('cancelled', '로그인을 취소했습니다.')); }
  async logout() {
    await this.ready;
    if (this.busy && !this.active) throw new AuthError('busy', '앱 설정을 저장하는 중입니다. 잠시 뒤 다시 시도해 주세요.');
    this.cancel();
    if (this.active) await this.active;
    this.busy = true; this.emit('signing-out');
    try {
      this.session = null;
      await this.vault.clear();
      this.account = null; this.minecraftError = null; this.error = null;
      if (this.config.clientId) this.makePca();
    } catch {
      this.error = publicError(new AuthError('logout_failed', '저장된 로그인 정보를 삭제하지 못했습니다. 파일 접근 권한을 확인한 뒤 로그아웃을 다시 시도해 주세요.'));
    } finally { this.busy = false; this.emit('idle'); }
    return this.snapshot();
  }
  // Main-process-only accessor for the future game runner. Never expose this over IPC.
  getGameSession() {
    if (!this.session || this.session.expiresAt <= Date.now()) return null;
    return { accessToken: this.session.accessToken, expiresAt: this.session.expiresAt, profile: { id: this.session.profile.id, name: this.session.profile.name } };
  }
}
module.exports = { AuthService };
