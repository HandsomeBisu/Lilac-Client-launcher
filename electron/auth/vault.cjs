const fs = require('node:fs/promises');
const path = require('node:path');
const { AuthError } = require('./errors.cjs');
class SecureVault {
  constructor(file, crypto) { this.file = file; this.crypto = crypto; }
  async check() {
    if (!await this.crypto.isAsyncEncryptionAvailable()) throw new AuthError('secure_storage_unavailable', 'Windows 암호화 저장소를 사용할 수 없습니다. 현재 Windows 사용자로 다시 실행해 주세요.');
  }
  async read() {
    let bytes;
    try { bytes = await fs.readFile(this.file); }
    catch (error) { if (error.code === 'ENOENT') return null; throw new AuthError('cache_read_failed', '저장된 로그인 정보를 읽을 수 없습니다.'); }
    await this.check();
    try {
      const decrypted = await this.crypto.decryptStringAsync(bytes);
      const value = JSON.parse(decrypted.result);
      if (value.schemaVersion !== 1 || typeof value.cache !== 'string') throw new Error('Invalid cache');
      return value;
    } catch { throw new AuthError('cache_decryption_failed', '저장된 로그인 정보를 복호화할 수 없습니다. 계정 창에서 로그아웃 후 다시 로그인해 주세요.'); }
  }
  async write(value) {
    await this.check();
    const encrypted = await this.crypto.encryptStringAsync(JSON.stringify({ ...value, schemaVersion: 1 }));
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    try {
      await fs.writeFile(temp, encrypted, { mode: 0o600 });
      await fs.rename(temp, this.file);
    } catch { throw new AuthError('cache_write_failed', '로그인 정보를 안전하게 저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { await fs.rm(temp, { force: true }).catch(() => {}); }
  }
  async clear() {
    await fs.rm(this.file, { force: true });
    await fs.rm(`${this.file}.tmp`, { force: true });
  }
}
module.exports = { SecureVault };
