(() => {
  'use strict';
  const { versions, defaults, normalize } = window.LilacModel;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const key = 'lilac.launcher.settings.v1';
  const motion = window.LilacMotion;
  let currentPage = null;
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
    if (currentPage !== page) {
      motion.reveal($(`#page-${page}`));
      currentPage = page;
    }
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
    motion.reveal($('#selected-version'));
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
    motion.open($('#info-dialog'));
  }
  $$('[data-window]').forEach(button => button.addEventListener('click', () => window.lilacDesktop?.windowControl(button.dataset.window)));
  $$('[data-page]').forEach(button => button.addEventListener('click', () => go(button.dataset.page)));
  $$('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
  $('.brand').addEventListener('click', event => { event.preventDefault(); go('home'); });
  $('#explore-button').addEventListener('click', () => go('versions'));
  const authApi = window.lilacDesktop?.auth;
  let authState = null;
  let skinSource = null;
  let accountsKey = null;
  function showAuthError(error) {
    $('#auth-error').textContent = error?.message || '요청을 처리하지 못했습니다.';
    $('#auth-error').hidden = false;
  }
  function renderAuth(value) {
    if (Number.isInteger(authState?.revision) && Number.isInteger(value.revision) && authState.revision > value.revision) return;
    authState = value;
    const busy = value.busy;
    const signedIn = value.signedIn;
    const profile = value.minecraft?.profile;
    renderAccounts(value);
    const stages = { initializing: '로그인 정보를 확인하는 중입니다.', configuring: '앱 설정을 저장하는 중입니다.', 'signing-out': '로그인 정보를 삭제하는 중입니다.', saving: '계정 정보를 저장하는 중입니다.', browser: '브라우저에서 Microsoft 로그인을 완료해 주세요.', microsoft: 'Microsoft 인증을 확인하는 중입니다.', xbox: 'Xbox 계정을 확인하는 중입니다.', minecraft: 'Minecraft 인증을 확인하는 중입니다.', profile: 'Minecraft 이용 권한과 프로필을 확인하는 중입니다.', restoring: '저장된 로그인 정보를 갱신하는 중입니다.' };
    $('#account-name').textContent = busy ? '인증 중' : profile?.name || (signedIn ? '프로필 확인 필요' : '로그인');
    $('#account-subtitle').textContent = busy ? 'Microsoft 계정' : value.minecraft?.verified ? 'Minecraft Java Edition' : signedIn ? 'Minecraft 확인 필요' : 'Microsoft 계정';
    $('#auth-status').textContent = stages[value.stage] || (!value.configured ? '지금은 로그인할 수 없습니다. 최신 버전을 확인해 주세요.' : '');
    $('#auth-status').hidden = value.configured && !busy && value.stage !== 'initializing';
    const error = value.error || value.minecraft?.error;
    $('#auth-error').hidden = !error || error.code === 'cancelled';
    $('#auth-error').textContent = error?.message || '';
    $('#auth-error').classList.toggle('informational', error?.code === 'cancelled');
    $('#auth-login').hidden = busy;
    $('#auth-login').disabled = !value.configured;
    $('#auth-login-label').textContent = 'Microsoft 계정 추가';
    $('#auth-refresh').hidden = !signedIn || busy || value.minecraft?.verified;
    $('#auth-logout').hidden = busy || signedIn || !value.error;
    $('#auth-cancel').hidden = !busy;
    $('#auth-logout-all').hidden = busy || !(value.accounts?.length > 1);
    $('.auth-progress').hidden = !busy;
    $('#auth-dialog').setAttribute('aria-busy', String(busy));
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
  function renderAccounts(value) {
    const list = $('#auth-account-list');
    const accounts = value.accounts || [];
    const nextKey = JSON.stringify(accounts.map(account => [account.id, account.active, account.profile])) + String(value.busy);
    if (nextKey === accountsKey) return;
    accountsKey = nextKey;
    $('#auth-account-count').textContent = String(accounts.length);
    const focusedId = document.activeElement?.closest('[data-switch-account]')?.dataset.switchAccount;
    const fragment = document.createDocumentFragment();
    if (!accounts.length) {
      const empty = document.createElement('p'); empty.className = 'account-empty';
      empty.textContent = '추가한 계정이 없습니다.'; fragment.append(empty);
    }
    for (const account of accounts) {
      const row = document.createElement('div'); row.className = `saved-account${account.active ? ' selected' : ''}`;
      const select = document.createElement('button'); select.className = 'account-select'; select.dataset.switchAccount = account.id;
      select.disabled = value.busy; select.setAttribute('aria-pressed', String(account.active));
      const nickname = account.profile?.name || '프로필 확인 필요';
      select.setAttribute('aria-label', `${nickname}${account.active ? ', 사용 중' : ', 계정 전환'}`);
      const avatar = document.createElement('span'); avatar.className = 'saved-avatar';
      const fallback = document.createElement('img'); fallback.src = 'assets/default-head.svg'; fallback.alt = '';
      avatar.append(fallback);
      if (account.profile?.skinDataUrl?.startsWith('data:image/png;base64,')) {
        const img = new Image();
        img.onload = () => {
          if (!avatar.isConnected) return;
          const canvas = document.createElement('canvas'); canvas.width = 8; canvas.height = 8;
          const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8); ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
          avatar.replaceChildren(canvas);
        };
        img.src = account.profile.skinDataUrl;
      }
      const text = document.createElement('span'); text.className = 'saved-account-text';
      const name = document.createElement('strong'); name.textContent = nickname;
      text.append(name);
      const status = document.createElement('span'); status.className = 'account-check'; status.textContent = account.active ? '사용 중' : '';
      select.append(avatar, text, status);
      const remove = document.createElement('button'); remove.className = 'account-remove'; remove.dataset.removeAccount = account.id;
      remove.disabled = value.busy; remove.textContent = '×'; remove.setAttribute('aria-label', `${nickname} 계정 삭제`);
      row.append(select, remove); fragment.append(row);
    }
    list.replaceChildren(fragment);
    if (focusedId && !value.busy) [...list.querySelectorAll('[data-switch-account]')].find(button => button.dataset.switchAccount === focusedId)?.focus({preventScroll:true});
  }
  async function authAction(action, value) {
    if (!authApi) { showAuthError({ message: '데스크톱 앱으로 실행해 주세요.' }); return; }
    try {
      const result = await authApi[action](value);
      if (result.ok) renderAuth(result.state); else showAuthError(result.error);
    } catch { showAuthError({ message: '계정 기능과 통신하지 못했습니다. 런처를 다시 실행해 주세요.' }); }
  }
  $('#account-button').addEventListener('click', () => { motion.open($('#auth-dialog')); $('#account-button').setAttribute('aria-expanded', 'true'); authAction('getState'); });
  $('#auth-login').addEventListener('click', () => authAction('login'));
  $('#auth-refresh').addEventListener('click', () => authAction('refresh'));
  $('#auth-logout').addEventListener('click', () => authAction('logout'));
  $('#auth-cancel').addEventListener('click', () => authAction('cancel'));
  $('#auth-logout-all').addEventListener('click', () => authAction('logoutAll'));
  $('#auth-account-list').addEventListener('click', event => {
    const select = event.target.closest('[data-switch-account]');
    if (select && !select.disabled && !authState?.busy) authAction('switchAccount', select.dataset.switchAccount);
    const remove = event.target.closest('[data-remove-account]');
    if (remove && !remove.disabled && !authState?.busy) authAction('removeAccount', remove.dataset.removeAccount);
  });
  $('#auth-dialog').addEventListener('close', () => { if (!$('#auth-dialog').open) $('#account-button').setAttribute('aria-expanded', 'false'); });
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
    motion.open($('#version-dialog'));
  });
  $('#quick-versions').addEventListener('click', event => {
    const button = event.target.closest('[data-quick]');
    if (button) { choose(button.dataset.quick); motion.close($('#version-dialog')); }
  });
  $$('.close-dialog').forEach(button => button.addEventListener('click', () => motion.close(button.closest('dialog'))));
  $$('dialog').forEach(dialog => dialog.addEventListener('cancel', event => { event.preventDefault(); motion.close(dialog); }));
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) motion.close(dialog);
  }));
  $('#info-confirm').addEventListener('click', async () => { const callback = onConfirm; onConfirm = null; await motion.close($('#info-dialog')); callback?.(); });
  $('#version-search').addEventListener('input', renderVersions);
  $$('[data-filter]').forEach(button => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    $$('[data-filter]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    renderVersions();
    motion.reveal($('#version-grid'));
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
      motion.animate(document.querySelector(`[data-favorite="${id}"] svg`), [{transform:'scale(.65)'},{transform:'scale(1.25)'},{transform:'scale(1)'}], {duration:240});
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
