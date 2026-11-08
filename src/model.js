(function (root) {
  'use strict';
  const versions = ['1.8.9','1.12.2','1.16.5','1.17.1','1.18.2','1.19.4','1.20.1','1.20.4','1.20.6','1.21.1','1.21.4','1.21.5','1.21.7','1.21.8','1.21.10','1.21.11','26.1.2','26.2','26.3'].map(version => Object.freeze({
    version, loader: ['1.8.9','1.12.2'].includes(version) ? 'Forge' : 'Fabric'
  }));
  const defaults = () => ({ schemaVersion: 1, version: '1.20.1', favorites: [], memory: 4, resolution: '1280x720', motion: true });
  function normalize(value) {
    const state = defaults();
    if (!value || typeof value !== 'object' || value.schemaVersion !== 1) return state;
    if (versions.some(item => item.version === value.version)) state.version = value.version;
    if (Array.isArray(value.favorites)) state.favorites = [...new Set(value.favorites.filter(id => versions.some(item => item.version === id)))];
    if (Number.isInteger(value.memory) && value.memory >= 2 && value.memory <= 16) state.memory = value.memory;
    if (['1280x720','1600x900','1920x1080'].includes(value.resolution)) state.resolution = value.resolution;
    if (typeof value.motion === 'boolean') state.motion = value.motion;
    return state;
  }
  const api = { versions: Object.freeze(versions), defaults, normalize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LilacModel = api;
})(globalThis);
