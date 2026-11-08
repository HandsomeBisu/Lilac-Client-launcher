(() => {
  'use strict';
  const { versions, defaults, normalize } = window.LilacModel;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const key = 'lilac.launcher.settings.v1';
  let state;
  let storageFailed = false;
  try { state = normalize(JSON.parse(localStorage.getItem(key))); }
  catch { state = defaults(); }
  let filter = 'all';
  let toastTimer;
  let onConfirm = null;
  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3000);
  }
  function save() {
    try { localStorage.setItem(key, JSON.stringify(state)); storageFailed = false; }
    catch { storageFailed = true; toast('설정을 저장하지 못했습니다. 이번 실행에만 적용됩니다.'); }
  }
  function go(page) {
    const labels = { home: '플레이', versions: '버전', mods: '모드', settings: '설정' };
    if (!labels[page]) page = 'home';
    $$('.page').forEach(item => { item.hidden = item.id !== `page-${page}`; });
    $$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
      if (item.dataset.page === page) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
    $('#page-label').textContent = labels[page];
    document.body.dataset.page = page;
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('main').scrollTop = 0;
    if (page === 'versions') renderVersions();
  }
  function sync() {
    const loader = versions.find(item => item.version === state.version).loader;
    $('#selected-version').textContent = state.version;
    $('#selected-loader').textContent = loader;
    $('#detail-loader').textContent = loader;
    $('#detail-memory').textContent = `${state.memory} GB`;
    $('#detail-resolution').textContent = state.resolution.replace('x', ' × ');
    $('#mods-version').textContent = state.version;
    $('#mods-loader').textContent = loader;
    $('#memory-slider').value = state.memory;
    $('#memory-value').textContent = `${state.memory} GB`;
    $('#resolution-select').value = state.resolution;
    $('#motion-toggle').setAttribute('aria-checked', String(state.motion));
    document.documentElement.classList.toggle('no-motion', !state.motion);
    renderVersions();
    renderFavorites();
  }
  function renderFavorites() {
    const items = versions.filter(item => state.favorites.includes(item.version));
    $('#home-favorites').hidden = items.length === 0;
    $('#home-favorites').classList.toggle('has-items', items.length > 0);
    $('#home-favorites').innerHTML = items.length
      ? items.map(item => `<button class="pinned-version" data-pinned="${item.version}" aria-pressed="${state.version === item.version}"><span>${item.version}</span><small>${item.loader}</small><svg><use href="#i-arrow"/></svg></button>`).join('')
      : '<p class="favorites-placeholder">등록한 버전이 없습니다. 버전 목록의 별표를 눌러 추가할 수 있습니다.</p>';
  }
  function choose(version) {
    if (!versions.some(item => item.version === version)) return;
    state.version = version;
    save();
    sync();
    if (!storageFailed) toast(`${version} ${versions.find(item => item.version === version).loader} 선택 완료`);
  }
  function renderVersions() {
    const query = $('#version-search').value.trim().toLowerCase();
    const items = versions.filter(item => item.version.includes(query) &&
      (filter === 'all' || (filter === 'favorites' ? state.favorites.includes(item.version) : item.loader === filter)));
    // Only fixed catalog values enter this template. User-entered search text is never rendered as HTML.
    $('#version-grid').innerHTML = items.map(item => `<article class="version-card ${item.version === state.version ? 'selected' : ''}" aria-label="Minecraft ${item.version}"><button class="favorite-button" data-favorite="${item.version}" aria-label="${item.version} 즐겨찾기" aria-pressed="${state.favorites.includes(item.version)}"><svg><use href="#i-star"/></svg></button><span class="version-number">${item.version}</span><span class="version-loader">${item.loader}</span><span class="planned">지원 예정</span><button class="choose-version" data-choose="${item.version}" aria-label="${item.version} 선택" aria-pressed="${item.version === state.version}">${item.version === state.version ? '선택됨' : '선택'}</button></article>`).join('');
    $('#empty-results').hidden = items.length !== 0;
  }
  function info(title, message, confirmLabel = '확인', callback = null) {
    $('#info-title').textContent = title;
    $('#info-message').textContent = message;
    $('#info-confirm').textContent = confirmLabel;
    $('#profile-summary').hidden = true;
    onConfirm = callback;
    $('#info-dialog').showModal();
  }
  $$('[data-window]').forEach(button => button.addEventListener('click', () => window.lilacDesktop?.windowControl(button.dataset.window)));
  $$('[data-page]').forEach(button => button.addEventListener('click', () => go(button.dataset.page)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  $('.brand').addEventListener('click', event => { event.preventDefault(); go('home'); });
  $('#explore-button').addEventListener('click', () => go('versions'));
  const authApi = window.lilacDesktop?.auth;
  let authState = null;
  let skinSource = null;
  function showAuthError(error) {
    $('#auth-error').textContent = error?.message || '요청을 처리하지 못했습니다.';
    $('#auth-error').hidden = false;
  }
  function renderAuth(value) {
    authState = value;
    const busy = value.busy;
    const signedIn = value.signedIn;
    const profile = value.minecraft?.profile;
    const stages = { initializing: '로그인 정보를 확인하는 중입니다.', configuring: '앱 설정을 저장하는 중입니다.', 'signing-out': '로그인 정보를 삭제하는 중입니다.', browser: '브라우저에서 Microsoft 로그인을 완료해 주세요.', microsoft: 'Microsoft 인증을 확인하는 중입니다.', xbox: 'Xbox 계정을 확인하는 중입니다.', minecraft: 'Minecraft 인증을 확인하는 중입니다.', profile: 'Minecraft 이용 권한과 프로필을 확인하는 중입니다.', restoring: '저장된 로그인 정보를 갱신하는 중입니다.' };
    $('#account-name').textContent = busy ? '인증 중' : profile?.name || value.account?.name || '로그인';
    $('#account-subtitle').textContent = busy ? 'Microsoft 계정' : value.minecraft?.verified ? 'Minecraft Java Edition' : signedIn ? 'Minecraft 확인 필요' : 'Microsoft 계정';
    $('#auth-status').textContent = stages[value.stage] || (!value.configured ? '로그인에 사용할 Microsoft 앱 ID를 먼저 설정해 주세요.' : signedIn ? (value.minecraft?.verified ? 'Minecraft Java 계정을 확인했습니다.' : 'Microsoft 로그인 정보가 있습니다. Minecraft 이용 가능 여부를 확인해 주세요.') : 'Microsoft 계정으로 로그인하세요.');
    $('#auth-profile').hidden = !signedIn;
    $('#auth-display-name').textContent = value.account?.name || '';
    $('#auth-username').textContent = value.account?.username || '';
    $('#auth-minecraft-profile').hidden = !profile;
    $('#auth-player-name').textContent = profile?.name || '';
    $('#auth-player-id').textContent = profile?.id || '';
    const error = value.error || value.minecraft?.error;
    $('#auth-error').hidden = !error;
    $('#auth-error').textContent = error?.message || '';
    $('#auth-login').hidden = busy;
    $('#auth-login').disabled = !value.configured;
    $('#auth-login').lastChild.textContent = signedIn ? '다시 로그인' : 'Microsoft로 로그인';
    $('#auth-refresh').hidden = !signedIn || busy;
    $('#auth-logout').hidden = busy || (!signedIn && !value.error);
    $('#auth-cancel').hidden = !busy;
    $('#auth-save-config').disabled = busy || value.configSource === 'environment';
    $('#auth-client-id').disabled = busy || value.configSource === 'environment';
    if (document.activeElement !== $('#auth-client-id')) $('#auth-client-id').value = value.clientId || '';
    if (!value.configured) $('#auth-developer').open = true;
    $('#auth-config-source').textContent = value.configSource === 'environment' ? 'LILAC_MS_CLIENT_ID 환경 변수에서 설정됨' : value.configured ? '앱 ID 저장됨 · 사용자별 앱 등록은 필요하지 않습니다.' : '앱 개발자가 한 번 등록하면 배포용으로 함께 사용할 수 있습니다.';
    const source = profile?.skinDataUrl || null;
    if (source !== skinSource) {
      skinSource = source;
      $('#account-head').hidden = true;
      $('#account-placeholder').hidden = false;
      if (source?.startsWith('data:image/png;base64,')) {
        const img = new Image();
        img.onload = () => {
          if (skinSource !== source) return;
          const ctx = $('#account-head').getContext('2d');
          ctx.clearRect(0, 0, 8, 8); ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
          ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
          $('#account-head').hidden = false; $('#account-placeholder').hidden = true;
        };
        img.src = source;
      }
    }
  }
  async function authAction(action, value) {
    if (!authApi) { showAuthError({ message: '데스크톱 앱으로 실행해 주세요.' }); return; }
    try {
      const result = await authApi[action](value);
      if (result.ok) renderAuth(result.state); else showAuthError(result.error);
    } catch { showAuthError({ message: '계정 기능과 통신하지 못했습니다. 런처를 다시 실행해 주세요.' }); }
  }
  $('#account-button').addEventListener('click', () => { $('#auth-dialog').showModal(); authAction('getState'); });
  $('#auth-login').addEventListener('click', () => authAction('login'));
  $('#auth-refresh').addEventListener('click', () => authAction('refresh'));
  $('#auth-logout').addEventListener('click', () => authAction('logout'));
  $('#auth-cancel').addEventListener('click', () => authAction('cancel'));
  $('#auth-config-form').addEventListener('submit', event => { event.preventDefault(); authAction('configure', $('#auth-client-id').value.trim()); });
  $$('[data-auth-help]').forEach(button => button.addEventListener('click', () => authAction('help', button.dataset.authHelp)));
  $('#auth-dialog').addEventListener('close', () => { if (authState?.busy) authAction('cancel'); });
  if (authApi) {
    const unsubscribe = authApi.onChanged(renderAuth);
    window.addEventListener('beforeunload', unsubscribe, { once: true });
    authAction('getState');
  }
  $('#play-button').addEventListener('click', () => {
    info('실행 설정', '게임 설치 및 실행 기능이 아직 연결되지 않았습니다. 아래 설정만 저장되어 있습니다.');
    $('#profile-summary').textContent = `Minecraft ${state.version} · ${versions.find(item => item.version === state.version).loader}\n최대 메모리 ${state.memory} GB · ${state.resolution.replace('x', ' × ')}`;
    $('#profile-summary').hidden = false;
  });
  $('#version-picker').addEventListener('click', () => {
    $('#quick-versions').innerHTML = versions.map(item => `<button class="quick-version" data-quick="${item.version}" aria-pressed="${state.version === item.version}">${item.version}<small>${item.loader}</small></button>`).join('');
    $('#version-dialog').showModal();
  });
  $('#quick-versions').addEventListener('click', event => {
    const button = event.target.closest('[data-quick]');
    if (button) { choose(button.dataset.quick); $('#version-dialog').close(); }
  });
  $$('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  }));
  $('#info-confirm').addEventListener('click', () => { $('#info-dialog').close(); const callback = onConfirm; onConfirm = null; callback?.(); });
  $('#version-search').addEventListener('input', renderVersions);
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    $$('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    renderVersions();
  }));
  $('#version-grid').addEventListener('click', event => {
    const choice = event.target.closest('[data-choose]');
    if (choice) choose(choice.dataset.choose);
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      const id = favorite.dataset.favorite;
      state.favorites = state.favorites.includes(id) ? state.favorites.filter(value => value !== id) : [...state.favorites, id];
      save();
      renderVersions();
      renderFavorites();
      const replacement = document.querySelector(`[data-favorite="${id}"]`);
      if (replacement) replacement.focus();
      else $('[data-filter="favorites"]').focus();
    }
  });
  $('#home-favorites').addEventListener('click', event => {
    const button = event.target.closest('[data-pinned]');
    if (button) {
      const id = button.dataset.pinned;
      choose(id);
      document.querySelector(`[data-pinned="${id}"]`)?.focus();
    }
  });
  $('#memory-slider').addEventListener('input', event => { state.memory = Number(event.target.value); $('#memory-value').textContent = `${state.memory} GB`; $('#detail-memory').textContent = `${state.memory} GB`; save(); });
  $('#resolution-select').addEventListener('change', event => { state.resolution = event.target.value; $('#detail-resolution').textContent = state.resolution.replace('x', ' × '); save(); if (!storageFailed) toast('해상도를 저장했습니다.'); });
  $('#motion-toggle').addEventListener('click', () => { state.motion = !state.motion; save(); sync(); });
  $('#reset-button').addEventListener('click', () => info('설정 초기화', '선택 버전, 즐겨찾기 및 실행 설정을 기본값으로 되돌립니다.', '초기화', () => { state = defaults(); save(); sync(); if (!storageFailed) toast('설정을 초기화했습니다.'); }));
  sync();
  go('home');
})();
