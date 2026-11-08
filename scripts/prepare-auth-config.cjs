const path = require('node:path');
const fs = require('node:fs/promises');
const { loadConfig } = require('../electron/auth/config.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const config = await loadConfig(path.join(root, 'config', 'microsoft.local.json'), process.env.LILAC_MS_CLIENT_ID);
  if (!config.clientId) throw new Error('Configure LILAC_MS_CLIENT_ID or config/microsoft.local.json before preparing a distribution.');
  const directory = path.join(root, '.generated');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'microsoft.json'), `${JSON.stringify({ clientId: config.clientId }, null, 2)}\n`);
  console.log('Prepared .generated/microsoft.json. Package this file as resources/microsoft.json.');
})().catch(() => { console.error('Cannot prepare Microsoft configuration. Check the local client ID and file permissions.'); process.exitCode = 1; });
