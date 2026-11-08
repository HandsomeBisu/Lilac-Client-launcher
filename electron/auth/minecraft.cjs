const { randomUUID } = require('node:crypto');
const { AuthError } = require('./errors.cjs');
const HOSTS = new Set(['user.auth.xboxlive.com', 'xsts.auth.xboxlive.com', 'api.minecraftservices.com']);
async function limitedBytes(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) throw new AuthError('invalid_response', '인증 서버에서 예상하지 못한 응답을 받았습니다.');
  const reader = response.body.getReader();
  const parts = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new AuthError('invalid_response', '인증 서버에서 예상하지 못한 응답을 받았습니다.');
      parts.push(Buffer.from(value));
    }
    return Buffer.concat(parts);
  } finally { await reader.cancel().catch(() => {}); }
}
function serviceError(stage, status, data) {
  const xerr = Number(data?.XErr);
  if (xerr === 2148916233) return new AuthError('xbox_profile_required', 'Xbox 프로필이 없습니다. xbox.com에서 프로필을 만든 뒤 다시 로그인해 주세요.');
  if ([2148916236,2148916237].includes(xerr)) return new AuthError('xbox_age_verification', 'Xbox 계정의 성인 인증이 필요합니다. Microsoft 계정에서 인증을 완료해 주세요.');
  if (xerr === 2148916238) return new AuthError('xbox_family_required', '자녀 계정의 Microsoft 가족 연결 및 Xbox 이용 설정을 확인해 주세요.');
  if (xerr === 2148916235) return new AuthError('xbox_region', '이 계정의 국가 또는 지역에서는 Xbox 인증을 완료할 수 없습니다.');
  if (status === 403 && stage === 'minecraft-login') return new AuthError('minecraft_app_access', 'Minecraft API 접근이 거부되었습니다 (403). Lilac 앱 ID의 API 접근 승인 상태를 확인해 주세요.');
  if (status === 404 && stage === 'profile') return new AuthError('minecraft_profile_required', 'Minecraft Java 프로필이 없습니다. minecraft.net에서 Java 프로필을 만든 뒤 다시 확인해 주세요.');
  if (status === 429) return new AuthError('rate_limited', '인증 요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요.');
  if (status === 401) return new AuthError('sign_in_required', '인증 정보가 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.');
  return new AuthError('minecraft_service_error', `게임 계정 확인에 실패했습니다 (${status}). 잠시 뒤 다시 확인해 주세요.`);
}
async function verifyMinecraft(msAccessToken, { signal, progress = () => {}, fetcher = fetch } = {}) {
  async function request(url, stage, body, token) {
    if (!HOSTS.has(new URL(url).hostname) || !url.startsWith('https://')) throw new AuthError('invalid_service', '허용되지 않은 인증 서버입니다.');
    signal?.throwIfAborted();
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET', redirect: 'error',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json', 'x-xbl-contract-version': '1' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000)
    });
    let data;
    try { data = JSON.parse((await limitedBytes(response, 2 * 1024 * 1024)).toString('utf8')); }
    catch (error) { if (!response.ok) throw serviceError(stage, response.status); throw error instanceof AuthError ? error : new AuthError('invalid_response', '게임 인증 응답을 읽을 수 없습니다.'); }
    if (!response.ok) throw serviceError(stage, response.status, data);
    return data;
  }
  function xboxToken(data) {
    const hash = data?.DisplayClaims?.xui?.[0]?.uhs;
    if (typeof data?.Token !== 'string' || !data.Token || typeof hash !== 'string' || !hash) throw new AuthError('invalid_response', 'Xbox 인증 응답에 필요한 정보가 없습니다.');
    return { token: data.Token, hash };
  }
  progress('xbox');
  const user = xboxToken(await request('https://user.auth.xboxlive.com/user/authenticate', 'xbox', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: `d=${msAccessToken}` },
    RelyingParty: 'http://auth.xboxlive.com', TokenType: 'JWT'
  }));
  const xsts = xboxToken(await request('https://xsts.auth.xboxlive.com/xsts/authorize', 'xsts', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [user.token] }, RelyingParty: 'rp://api.minecraftservices.com/', TokenType: 'JWT'
  }));
  if (xsts.hash !== user.hash) throw new AuthError('invalid_response', 'Xbox 인증 정보가 일치하지 않습니다. 다시 로그인해 주세요.');
  progress('minecraft');
  const login = await request('https://api.minecraftservices.com/launcher/login', 'minecraft-login', {
    xtoken: `XBL3.0 x=${xsts.hash};${xsts.token}`, platform: 'PC_LAUNCHER'
  });
  if (typeof login.access_token !== 'string' || !login.access_token || !Number.isFinite(login.expires_in) || login.expires_in <= 0) throw new AuthError('invalid_response', 'Minecraft 인증 토큰 응답이 올바르지 않습니다.');
  const token = login.access_token;
  progress('profile');
  const entitlements = await request(`https://api.minecraftservices.com/entitlements/license?requestId=${randomUUID()}`, 'entitlements', null, token);
  if (!Array.isArray(entitlements.items)) throw new AuthError('invalid_response', 'Minecraft 이용 권한 응답이 올바르지 않습니다.');
  if (!entitlements.items.some(item => ['game_minecraft','product_minecraft'].includes(item?.name))) throw new AuthError('minecraft_not_owned', '이 계정에서 Minecraft Java 이용 권한을 확인하지 못했습니다. 구매한 계정 또는 Game Pass 구독 상태를 확인해 주세요.');
  const profile = await request('https://api.minecraftservices.com/minecraft/profile', 'profile', null, token);
  if (!/^[a-f\d]{32}$/i.test(profile.id || '') || !/^[A-Za-z0-9_]{1,16}$/.test(profile.name || '')) throw new AuthError('invalid_response', 'Minecraft 프로필 응답이 올바르지 않습니다.');
  let skinDataUrl = null;
  const skin = profile.skins?.find(item => item.state === 'ACTIVE');
  // A cosmetic download failure must not invalidate a verified game session.
  if (skin?.url) {
    try {
      const url = new URL(skin.url);
      if (url.hostname === 'textures.minecraft.net' && /^\/texture\/[a-f\d]{64}$/i.test(url.pathname) && ['http:','https:'].includes(url.protocol)) {
        url.protocol = 'https:';
        const response = await fetcher(url.href, { redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
        if (response.ok) {
          const bytes = await limitedBytes(response, 262144);
          if (bytes.length >= 33 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.readUInt32BE(16) === 64 && [32,64].includes(bytes.readUInt32BE(20))) skinDataUrl = `data:image/png;base64,${bytes.toString('base64')}`;
        }
      }
    } catch { /* Keep the neutral account avatar. */ }
  }
  signal?.throwIfAborted();
  return { accessToken: token, expiresAt: Date.now() + login.expires_in * 1000, profile: { id: profile.id, name: profile.name, skinDataUrl } };
}
module.exports = { verifyMinecraft, serviceError, limitedBytes };
