const { PublicClientApplication, CryptoProvider } = require('@azure/msal-node');
const { randomBytes } = require('node:crypto');
const { AUTHORITY, SCOPES, loadConfig, saveConfig, validateClientId } = require('./config.cjs');
const { AuthError, publicError } = require('./errors.cjs');
const { startLoopback } = require('./loopback.cjs');
const { verifyMinecraft, limitedBytes } = require('./minecraft.cjs');
function publicProfile(profile) {
  if (!profile || typeof profile.id !== 'string' || typeof profile.name !== 'string') return null;
  return { id: profile.id, name: profile.name, skinDataUrl: typeof profile.skinDataUrl === 'string' && profile.skinDataUrl.startsWith('data:image/png;base64,') && profile.skinDataUrl.length < 350000 ? profile.skinDataUrl : null };
}

class AuthService {
  constructor({ configFile, envClientId, vault, openBrowser, publish = () => {}, pcaFactory, verify = verifyMinecraft, loopback = startLoopback }) {
    Object.assign(this, { configFile, envClientId, vault, openBrowser, publish, verify, loopback });
    this.pcaFactory = pcaFactory || (config => new PublicClientApplication(config));
    this.config = { clientId: null, source: 'none' };
    this.account = null; this.session = null; this.minecraftError = null; this.error = null;
    this.accounts = new Map(); this.profiles = new Map();
    this.busy = false; this.stage = 'initializing'; this.active = null;
    this.revision = 0;
    this.ready = this.initialize();
  }
  snapshot() {
    const profile = publicProfile(this.session?.profile || this.profiles.get(this.account?.homeAccountId));
    return {
      configured: Boolean(this.config.clientId),
      revision: this.revision,
      busy: this.busy, stage: this.stage, signedIn: Boolean(this.account),
      account: this.account ? { id: this.account.homeAccountId } : null,
      accounts: [...this.accounts.values()].map(account => ({ id: account.homeAccountId, active: account.homeAccountId === this.account?.homeAccountId, profile: publicProfile(this.profiles.get(account.homeAccountId)) })),
      minecraft: { verified: Boolean(this.session && this.session.expiresAt > Date.now()), profile, error: this.minecraftError },
      error: this.error
    };
  }
  emit(stage) { if (stage) this.stage = stage; this.revision++; this.publish(this.snapshot()); }
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
          await this.syncAccounts();
          this.account = this.accounts.get(cached.accountId) || this.accounts.values().next().value || null;
          for (const entry of Array.isArray(cached.profiles) ? cached.profiles : []) {
            const profile = publicProfile(entry.profile);
            if (this.accounts.has(entry.accountId) && profile) this.profiles.set(entry.accountId, profile);
          }
        }
      }
    } catch (error) { this.error = publicError(error); }
    this.emit('idle');
  }
  async persist() {
    if (!this.accounts.size) return this.vault.clear();
    await this.vault.write({ clientId: this.config.clientId, accountId: this.account?.homeAccountId || null, cache: this.pca.getTokenCache().serialize(), profiles: [...this.profiles].map(([accountId, profile]) => ({accountId, profile: publicProfile(profile)})) });
  }
  async syncAccounts(candidate) {
    this.accounts = new Map((await this.pca.getTokenCache().getAllAccounts()).filter(account => typeof account.homeAccountId === 'string').map(account => [account.homeAccountId, account]));
    if (candidate) this.accounts.set(candidate.homeAccountId, candidate);
    for (const id of this.profiles.keys()) if (!this.accounts.has(id)) this.profiles.delete(id);
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
      this.accounts.clear(); this.profiles.clear();
      this.config = await saveConfig(this.configFile, clientId);
      this.makePca(); this.error = null;
    } finally { this.busy = false; this.emit('idle'); }
    return this.snapshot();
  }
  async login() { return this.run(true); }
  async refresh() { return this.run(false); }
  async switchAccount(accountId) {
    await this.ready;
    if (typeof accountId !== 'string' || !this.accounts.has(accountId)) throw new AuthError('unknown_account', '저장된 계정을 찾을 수 없습니다. 계정을 다시 추가해 주세요.');
    return this.run(false, accountId);
  }
  async run(interactive, targetAccountId = null) {
    await this.ready;
    if (this.active || this.busy) throw new AuthError('busy', '이미 인증을 진행하고 있습니다.');
    if (!this.config.clientId) throw new AuthError('configuration_required', '이 버전에서는 로그인을 사용할 수 없습니다. 최신 버전을 확인하거나 배포자에게 문의해 주세요.');
    const previous = { account: this.account, session: this.session, minecraftError: this.minecraftError, accounts: new Map(this.accounts), profiles: new Map(this.profiles), cache: this.pca.getTokenCache().serialize() };
    const target = targetAccountId ? this.accounts.get(targetAccountId) : this.account;
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
          if (!target) throw new AuthError('sign_in_required', 'Microsoft 계정으로 로그인해 주세요.');
          result = await this.pca.acquireTokenSilent({ account: target, scopes: [...SCOPES] });
        }
        controller.signal.throwIfAborted();
        if (!result?.account || !result.accessToken) throw new AuthError('invalid_response', 'Microsoft 인증 응답에 계정 정보가 없습니다.');
        if (!interactive && result.account.homeAccountId !== target.homeAccountId) throw new AuthError('account_mismatch', '선택한 계정과 인증 응답이 일치하지 않습니다. 다시 로그인해 주세요.');
        let nextSession = null, nextError = null;
        try {
          nextSession = await this.verify(result.accessToken, { signal: controller.signal, progress: stage => this.emit(stage) });
        } catch (error) {
          if (controller.signal.aborted) throw error;
          nextError = publicError(error);
        }
        controller.signal.throwIfAborted();
        await this.syncAccounts(result.account);
        this.account = result.account; this.session = nextSession; this.minecraftError = nextError;
        if (nextSession) this.profiles.set(result.account.homeAccountId, publicProfile(nextSession.profile));
        this.emit('saving');
        await this.persist();
      } catch (error) {
        this.pca.getTokenCache().deserialize(previous.cache);
        this.account = previous.account; this.accounts = previous.accounts; this.profiles = previous.profiles;
        this.session = interactive || targetAccountId ? previous.session : null;
        this.minecraftError = previous.minecraftError;
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
    if (this.account) return this.removeAccount(this.account.homeAccountId);
    return this.logoutAll();
  }
  async removeAccount(accountId) {
    await this.ready;
    if (this.busy) throw new AuthError('busy', '진행 중인 인증을 먼저 완료하거나 취소해 주세요.');
    const account = this.accounts.get(accountId);
    if (!account) throw new AuthError('unknown_account', '저장된 계정을 찾을 수 없습니다.');
    const previous = { account: this.account, session: this.session, accounts: new Map(this.accounts), profiles: new Map(this.profiles), cache: this.pca.getTokenCache().serialize() };
    const removingActive = accountId === this.account?.homeAccountId;
    this.busy = true; this.emit('signing-out');
    let success = false;
    try {
      await this.pca.getTokenCache().removeAccount(account);
      this.accounts.delete(accountId); this.profiles.delete(accountId);
      if (removingActive) { this.account = this.accounts.values().next().value || null; this.session = null; }
      this.error = null; this.minecraftError = null;
      await this.persist(); success = true;
    } catch {
      this.pca.getTokenCache().deserialize(previous.cache);
      this.account = previous.account; this.session = previous.session; this.accounts = previous.accounts; this.profiles = previous.profiles;
      this.error = publicError(new AuthError('logout_failed', '계정을 삭제하지 못했습니다. 다시 시도해 주세요.'));
    } finally { this.busy = false; this.emit('idle'); }
    if (success && removingActive && this.account) return this.refresh();
    return this.snapshot();
  }
  async logoutAll() {
    await this.ready;
    if (this.busy && !this.active) throw new AuthError('busy', '계정 정보를 저장하는 중입니다.');
    this.cancel();
    if (this.active) await this.active;
    this.busy = true; this.emit('signing-out');
    try {
      this.session = null;
      await this.vault.clear();
      this.account = null; this.minecraftError = null; this.error = null;
      this.accounts.clear(); this.profiles.clear();
      if (this.config.clientId) this.makePca();
    } catch {
      this.error = publicError(new AuthError('logout_failed', '저장된 로그인 정보를 삭제하지 못했습니다. 파일 접근 권한을 확인한 뒤 로그아웃을 다시 시도해 주세요.'));
    } finally { this.busy = false; this.emit('idle'); }
    return this.snapshot();
  }
  // Main-process-only accessor for the future game runner. Never expose this over IPC.
  getGameSession() {
    if (this.busy || !this.session || this.session.expiresAt <= Date.now()) return null;
    return { accessToken: this.session.accessToken, expiresAt: this.session.expiresAt, profile: { id: this.session.profile.id, name: this.session.profile.name } };
  }
}
module.exports = { AuthService };
