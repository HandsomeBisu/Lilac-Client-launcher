const fs = require('node:fs/promises');
const path = require('node:path');
const { AuthError } = require('./errors.cjs');
const AUTHORITY = 'https://login.microsoftonline.com/consumers';
const SCOPES = Object.freeze(['XboxLive.signin', 'openid', 'profile', 'offline_access']);
function validateClientId(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value.trim())) throw new AuthError('invalid_client_id', 'Application (client) ID 형식의 UUID를 입력해 주세요.');
  return value.trim().toLowerCase();
}
async function loadConfig(file, envId) {
  if (envId) return { clientId: validateClientId(envId), source: 'environment' };
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return { clientId: validateClientId(value.clientId), source: 'file' };
  } catch (error) {
    if (error.code === 'ENOENT') return { clientId: null, source: 'none' };
    throw new AuthError('invalid_config', '런처의 로그인 설정을 읽을 수 없습니다. 최신 버전을 확인하거나 배포자에게 문의해 주세요.');
  }
}
async function saveConfig(file, clientId) {
  const id = validateClientId(clientId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify({ clientId: id }, null, 2)}\n`, { mode: 0o600 });
  return { clientId: id, source: 'file' };
}
module.exports = { AUTHORITY, SCOPES, validateClientId, loadConfig, saveConfig };
