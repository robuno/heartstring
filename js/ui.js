/* Heartstring — menus, lobby (room codes), character select, level map, HUD. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const HS = window.HS, Game = window.Game, Net = window.Net, Sfx = window.Sfx, I18N = window.I18N;
  const t = (k, v) => I18N.t(k, v);

  const PROG_KEY = 'heartstring.progress.v1';
  const NAME_KEY = 'heartstring.name';

  const App = {
    mode: null, // 'online' | 'local'
    role: null, // 'host' | 'guest' (online)
    myChar: null,
    name: '', partnerName: '',
    lobby: { boy: null, girl: null }, // online: 'host'|'guest'; local: 'p1'|'p2'
    worldTab: 0, curLevel: null, screen: 'menu', prog: null, pingTimer: null,
  };

  // ---------------- progress ----------------
  function loadProg() {
    try { const p = JSON.parse(localStorage.getItem(PROG_KEY)); if (p && p.done) return p; } catch (e) { /* ignore */ }
    return { done: {}, last: 1 };
  }
  function saveProg() { try { localStorage.setItem(PROG_KEY, JSON.stringify(App.prog)); } catch (e) { /* ignore */ } }
  function mergeProg(o) {
    if (!o || !o.done) return;
    for (const k in o.done) {
      const a = App.prog.done[k], b = o.done[k];
      if (!a) App.prog.done[k] = b;
      else App.prog.done[k] = { hearts: Math.max(a.hearts || 0, b.hearts || 0), total: a.total || b.total, time: Math.min(a.time || 1e9, b.time || 1e9) };
    }
    saveProg();
    if (App.screen === 'map') renderMap();
  }
  function totals() {
    let hearts = 0, done = 0;
    for (const k in App.prog.done) { done++; hearts += App.prog.done[k].hearts || 0; }
    return { hearts, done };
  }
  function nextUnfinished() {
    for (let n = 1; n <= HS.LEVELS; n++) if (!App.prog.done[n]) return n;
    return HS.LEVELS;
  }

  // ---------------- helpers ----------------
  function show(id) {
    App.screen = id;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + id));
    $('#hud').classList.toggle('hidden', id !== 'game');
    document.body.classList.toggle('in-game', id === 'game');
    if (id !== 'game') { closeModals(); }
  }
  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }
  function fmtTime(s) {
    if (!isFinite(s) || s >= 1e8) return '—';
    const m = Math.floor(s / 60), r = Math.floor(s % 60);
    return m + ':' + String(r).padStart(2, '0');
  }
  function openModal(id) { closeModals(); $('#' + id).classList.remove('hidden'); }
  function closeModals() { $$('.modal').forEach(m => m.classList.add('hidden')); Game.setPaused(false); }
  function modalOpen() { return $$('.modal').some(m => !m.classList.contains('hidden')); }
  function click() { Sfx.play('click'); }
  function myName() { return (App.name || '').trim() || (App.myChar === 'girl' ? t('char.girl') : App.myChar === 'boy' ? t('char.boy') : 'Player'); }

  // ---------------- menu ----------------
  function initMenu() {
    App.prog = loadProg();
    App.name = localStorage.getItem(NAME_KEY) || '';
    $('#in-name').value = App.name;
    $('#in-name').addEventListener('input', (e) => { App.name = e.target.value.slice(0, 14); try { localStorage.setItem(NAME_KEY, App.name); } catch (er) { /* ignore */ } });

    $('#btn-host').onclick = () => { click(); Sfx.ensure(); hostRoom(); };
    $('#btn-join').onclick = () => { click(); Sfx.ensure(); show('join'); setTimeout(() => $('#in-code').focus(), 50); };
    $('#btn-local').onclick = () => { click(); Sfx.ensure(); startLocal(); };
    $('#btn-help').onclick = () => { click(); openModal('mdl-help'); };
    $$('[data-back]').forEach(b => b.onclick = () => { click(); Net.leave(); show('menu'); });
    $('#btn-join-go').onclick = () => { click(); joinRoom($('#in-code').value); };
    $('#in-code').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    $('#in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('#in-code').value); });
    $$('[data-close]').forEach(b => b.onclick = () => { click(); closeModals(); });

    // invite links: ?room=CODE
    const q = new URLSearchParams(location.search).get('room');
    if (q) {
      $('#in-code').value = q.toUpperCase().slice(0, 5);
      show('join');
      $('#join-status').textContent = t('join.invite');
    }
  }

  // ---------------- online: host / join ----------------
  function requirePeer() {
    if (!Net.available()) { toast(t('toast.noPeer'), 'err'); return false; }
    return true;
  }
  function hostRoom() {
    if (!requirePeer()) return;
    App.mode = 'online'; App.role = 'host'; App.lobby = { boy: null, girl: null }; App.partnerName = ''; App.myChar = null;
    show('lobby'); renderLobby();
    $('#room-code').textContent = '·····';
    $('#lobby-status').textContent = t('lobby.creating');
    wireNet();
    Net.host();
  }
  function joinRoom(code) {
    code = (code || '').toUpperCase().trim();
    if (code.length < 5) { $('#join-status').textContent = t('join.short'); return; }
    if (!requirePeer()) return;
    App.mode = 'online'; App.role = 'guest'; App.lobby = { boy: null, girl: null }; App.partnerName = ''; App.myChar = null;
    $('#join-status').textContent = t('join.connecting');
    wireNet();
    Net.join(code);
  }

  function wireNet() {
    Net.on('ready', (code) => {
      $('#room-code').textContent = code;
      $('#lobby-status').innerHTML = t('lobby.send') + ' <span class="dots"></span>';
      // host gets first pick by default: nothing chosen yet
    });
    Net.on('connected', () => {
      Sfx.play('cp');
      if (App.role === 'guest') {
        Net.send({ t: 'hello', name: App.name, prog: App.prog });
        show('lobby'); renderLobby();
        $('#room-code').textContent = Net.code;
        $('#lobby-status').textContent = t('lobby.connected');
      } else {
        $('#lobby-status').textContent = t('lobby.joined');
      }
      startPing();
    });
    Net.on('data', onData);
    Net.on('disconnected', () => {
      stopPing();
      toast(t('toast.disc'), 'err');
      if (App.role === 'host') {
        App.lobby = { boy: App.lobby.boy === 'host' ? 'host' : null, girl: App.lobby.girl === 'host' ? 'host' : null };
        App.partnerName = '';
        Game.stop(); show('lobby'); renderLobby();
        $('#lobby-status').innerHTML = t('lobby.rejoin') + ' <span class="dots"></span>';
      } else {
        Game.stop(); Net.leave(); show('menu');
      }
    });
    Net.on('error', (e) => {
      const msg = (e && e.message) || t('toast.conn');
      if (App.screen === 'join') $('#join-status').textContent = msg;
      else toast(msg, 'err');
      if (App.role === 'host' && App.screen === 'lobby' && !Net.connected()) $('#lobby-status').textContent = t('lobby.fail', { msg });
    });
  }

  function startPing() {
    stopPing();
    App.pingTimer = setInterval(() => Net.send({ t: 'ping', ts: Date.now() }), 2000);
  }
  function stopPing() { if (App.pingTimer) clearInterval(App.pingTimer); App.pingTimer = null; }

  function onData(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello':
        if (App.role !== 'host') return;
        App.partnerName = String(m.name || '').slice(0, 14);
        mergeProg(m.prog);
        Net.send({ t: 'welcome', name: App.name, prog: App.prog });
        broadcastLobby();
        break;
      case 'welcome':
        App.partnerName = String(m.name || '').slice(0, 14);
        mergeProg(m.prog);
        renderLobby();
        break;
      case 'name':
        App.partnerName = String(m.name || '').slice(0, 14); renderLobby(); break;
      case 'lobby':
        if (App.role !== 'guest') return;
        App.lobby = m.lobby; applyLobby(); renderLobby();
        break;
      case 'pick':
        if (App.role === 'host') hostAssign('guest', m.char);
        break;
      case 'nav':
        if (App.role === 'guest') doNav(m);
        break;
      case 'req':
        if (App.role === 'host') handleReq(m);
        break;
      case 'prog': mergeProg(m.prog); break;
      case 'ping': Net.send({ t: 'pong', ts: m.ts }); break;
      case 'pong': Game.setPing(Date.now() - m.ts); break;
      case 'full':
        toast(t('toast.full'), 'err'); Net.leave(); show('menu'); break;
      default:
        Game.onNet(m);
    }
  }

  // ---------------- lobby ----------------
  function applyLobby() {
    const me = App.mode === 'online' ? App.role : null;
    if (App.mode === 'online') App.myChar = App.lobby.boy === me ? 'boy' : App.lobby.girl === me ? 'girl' : null;
  }
  function hostAssign(who, char) {
    if (char !== 'boy' && char !== 'girl') return;
    if (App.lobby[char] && App.lobby[char] !== who) {
      if (who === 'host') toast(t('toast.taken'));
      return;
    }
    const otherC = char === 'boy' ? 'girl' : 'boy';
    if (App.lobby[otherC] === who) App.lobby[otherC] = null;
    App.lobby[char] = who;
    broadcastLobby();
  }
  function broadcastLobby() {
    Net.send({ t: 'lobby', lobby: App.lobby });
    applyLobby(); renderLobby();
  }

  function startLocal() {
    App.mode = 'local'; App.role = null;
    App.lobby = { boy: 'p1', girl: 'p2' };
    show('lobby'); renderLobby();
  }

  function renderLobby() {
    const online = App.mode === 'online';
    $('#lobby-online').style.display = online ? '' : 'none';
    $('#lobby-local').style.display = online ? 'none' : '';
    $$('.char-card').forEach(card => {
      const ch = card.dataset.char;
      const owner = App.lobby[ch];
      let label = '';
      card.classList.remove('mine', 'theirs');
      if (online) {
        if (owner === App.role) { label = t('lobby.you') + (App.name ? ' · ' + App.name : ''); card.classList.add('mine'); }
        else if (owner) { label = (App.partnerName || t('lobby.partner')); card.classList.add('theirs'); }
        else label = t('lobby.pick');
      } else {
        label = owner === 'p1' ? t('lobby.p1') : t('lobby.p2');
        card.classList.add(owner === 'p1' ? 'mine' : 'theirs');
      }
      card.querySelector('.char-owner').textContent = label;
    });
    const ready = online ? (App.lobby.boy && App.lobby.girl && Net.connected()) : true;
    const btn = $('#btn-lobby-go');
    btn.disabled = !ready;
    btn.textContent = online && App.role === 'guest' ? t('lobby.openMap') : t('lobby.choose');
    if (online && Net.connected() && !ready) $('#lobby-status').textContent = t('lobby.bothPick');
    else if (online && ready) $('#lobby-status').textContent = App.partnerName ? t('lobby.ready', { who: App.partnerName }) : t('lobby.readyAnon');
  }

  function initLobby() {
    $$('.char-card').forEach(card => {
      card.onclick = () => {
        click();
        const ch = card.dataset.char;
        if (App.mode === 'local') {
          // clicking a card makes it Player 1's
          App.lobby = ch === 'boy' ? { boy: 'p1', girl: 'p2' } : { boy: 'p2', girl: 'p1' };
          renderLobby();
        } else if (App.role === 'host') hostAssign('host', ch);
        else Net.send({ t: 'pick', char: ch });
      };
    });
    $('#btn-lobby-go').onclick = () => { click(); request({ to: 'map' }); };
    $('#btn-lobby-leave').onclick = () => { click(); leaveAll(); };
    $('#btn-copy-code').onclick = () => copy(Net.code || $('#room-code').textContent, t('toast.codeCopied'));
    $('#btn-copy-link').onclick = () => {
      const url = location.origin + location.pathname + '?room=' + (Net.code || '');
      copy(url, t('toast.linkCopied'));
    };
    // animated previews
    const previews = $$('.char-card canvas');
    const loop = (ts) => {
      requestAnimationFrame(loop);
      if (App.screen !== 'lobby') return;
      previews.forEach(c => Game.drawPreview(c, c.parentElement.dataset.char, ts / 1000));
    };
    requestAnimationFrame(loop);
  }

  function copy(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast(text); }
    ta.remove();
  }

  function leaveAll() {
    stopPing();
    Game.stop();
    Net.leave();
    App.mode = null; App.role = null; App.myChar = null;
    show('menu');
  }

  // ---------------- navigation (host is authoritative online) ----------------
  function request(m) {
    if (App.mode === 'online' && App.role === 'guest') { Net.send(Object.assign({ t: 'req' }, m)); return; }
    if (App.mode === 'online') {
      if (m.to === 'level' && !(App.lobby.boy && App.lobby.girl)) { toast(t('toast.needChars')); return; }
      Net.send(Object.assign({ t: 'nav' }, m));
    }
    doNav(m);
  }
  function handleReq(m) {
    if (!['map', 'level', 'lobby'].includes(m.to)) return;
    if (m.to === 'level') { const n = m.n | 0; if (n < 1 || n > HS.LEVELS) return; }
    request({ to: m.to, n: m.n });
  }
  function doNav(m) {
    if (m.to === 'map') {
      Game.stop();
      if (App.curLevel) App.worldTab = Math.floor((App.curLevel - 1) / 10);
      show('map'); renderMap();
    } else if (m.to === 'level') {
      startGame(m.n | 0);
    } else if (m.to === 'lobby') {
      Game.stop(); show('lobby'); renderLobby();
    }
  }

  function startGame(n) {
    n = Math.max(1, Math.min(HS.LEVELS, n));
    App.curLevel = n;
    App.prog.last = n; saveProg();
    let schemes, myChar;
    if (App.mode === 'online') {
      applyLobby();
      myChar = App.myChar || 'boy';
      schemes = { [myChar]: 'solo' };
    } else {
      myChar = 'boy';
      schemes = { boy: App.lobby.boy === 'p1' ? 'p1' : 'p2', girl: App.lobby.girl === 'p1' ? 'p1' : 'p2' };
    }
    const partner = myChar === 'boy' ? 'girl' : 'boy';
    const names = { [myChar]: myName(), [partner]: App.partnerName || t('char.' + partner) };
    show('game');
    Game.startLevel(n, { mode: App.mode, myChar, schemes, names, net: App.mode === 'online' ? Net : null, music: Sfx.musicOn });
    renderHudTitle();
    renderHearts(0, Game.level.hearts.length);
    lastHearts = -1;
    const h = $('#hud-hint'); h.textContent = t(App.mode === 'online' ? 'hint.online' : 'hint.local'); h.classList.remove('fade'); void h.offsetWidth; h.classList.add('fade');
    App.chatWho = App.mode === 'online' ? myChar : 'girl';
    $('#chat-in').value = '';
    renderChat();
  }
  function renderHudTitle() {
    const L = Game.level; if (!L) return;
    $('#hud-world').textContent = L.world.icon;
    $('#hud-level').textContent = `${L.n}. ${I18N.levelName(L.wi, L.local)}`;
  }

  // ---------------- chat & sweet words ----------------
  function chatChar() { return App.mode === 'online' ? (App.myChar || Game.myChar) : (App.chatWho || 'girl'); }
  function renderChat() {
    const q = $('#chat-quick');
    q.innerHTML = '';
    const mk = (label, cls, fn) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip ' + (cls || ''); b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.onclick = () => { fn(); b.blur(); b.classList.remove('popped'); void b.offsetWidth; b.classList.add('popped'); };
      q.appendChild(b);
    };
    const chips = t('chips');
    chips.forEach((label, i) => mk(label, 'love', () => Game.say(chatChar(), i)));
    mk(t('chat.dance'), 'fun', () => Game.act(chatChar(), 'dance'));
    mk(t('chat.matcha'), 'fun matcha', () => Game.act(chatChar(), 'matcha'));
    mk(t('chat.eat'), 'fun eat', () => Game.act(chatChar(), 'eat'));
    mk(t('chat.orange'), 'fun eat', () => Game.act(chatChar(), 'orange'));
    if (chatChar() === 'girl') mk(t('chat.shine'), 'fun shine', () => Game.shine('girl'));
    mk(t('chat.magic'), 'fun shine', () => Game.magic(chatChar()));
    mk(t('chat.wardrobe'), 'fun shine', () => openWardrobe(chatChar()));
    if (chatChar() === 'girl') mk(t('chat.outfit'), 'fun shine', () => Game.outfit('girl'));
    const who = $('#chat-who');
    who.style.display = App.mode === 'online' ? 'none' : '';
    who.textContent = chatChar() === 'girl' ? '👧' : '👦';
    who.classList.toggle('girl', chatChar() === 'girl');
  }
  let typingOn = false, typingSent = 0;
  function setTypingState(on) {
    const now = Date.now();
    if (on === typingOn && !(on && now - typingSent > 3000)) return;
    typingOn = on; typingSent = now;
    Game.setTyping(chatChar(), on);
  }
  function initChat() {
    const inp = $('#chat-in');
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = inp.value.trim();
      if (v) Game.chat(chatChar(), v);
      inp.value = '';
      typingOn = false;
      inp.blur();
    });
    inp.addEventListener('input', () => { setTypingState(inp.value.trim().length > 0); if (Math.random() < 0.5) Sfx.play('type'); });
    inp.addEventListener('focus', () => { Game._G.keys.clear(); document.body.classList.add('chatting'); });
    inp.addEventListener('blur', () => { setTypingState(false); document.body.classList.remove('chatting'); });
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { inp.value = ''; inp.blur(); }
    });
    $('#chat-who').addEventListener('mousedown', (e) => e.preventDefault());
    $('#chat-who').onclick = () => { click(); App.chatWho = chatChar() === 'girl' ? 'boy' : 'girl'; renderChat(); };
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || App.screen !== 'game' || modalOpen()) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault(); inp.focus();
    });
  }

  // ---------------- language ----------------
  function initLang() {
    $$('#btn-lang-menu, #btn-lang-hud, #btn-lang-pause').forEach(b => {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.onclick = () => { click(); I18N.toggle(); };
    });
    I18N.onChange(() => {
      if (App.screen === 'lobby') renderLobby();
      if (App.screen === 'map') renderMap();
      if (App.screen === 'game') {
        renderHudTitle(); renderChat();
        $('#hud-hint').textContent = t(App.mode === 'online' ? 'hint.online' : 'hint.local');
      }
      if (!$('#mdl-pause').classList.contains('hidden')) $('#pause-note').textContent = t(App.mode === 'online' ? 'pause.online' : 'pause.local');
    });
    I18N.apply();
  }

  // ---------------- HUD ----------------
  function renderHearts(got, total) {
    let s = '';
    for (let i = 0; i < total; i++) s += `<span class="hh ${i < got ? 'on' : ''}">♥</span>`;
    $('#hud-hearts').innerHTML = s;
  }
  let lastHearts = -1;
  function initHud() {
    Game.setHooks({
      hud: (h) => {
        if (h.hearts !== lastHearts) { renderHearts(h.hearts, h.total); lastHearts = h.hearts; }
        $('#hud-time').textContent = '⏱ ' + fmtTime(h.time);
        $('#hud-deaths').textContent = '💫 ' + h.deaths;
        $('#hud-ping').textContent = App.mode === 'online' && h.ping != null ? h.ping + ' ms' : '';
      },
      win: onWin,
      wardrobe: openWardrobe,
    });
    $('#btn-pause').onclick = () => { click(); togglePause(); };
    const syncAudioBtns = () => {
      $('#btn-music').classList.toggle('off', !Sfx.musicOn);
      $('#btn-sfx').classList.toggle('off', !Sfx.sfxOn);
    };
    $('#btn-music').onclick = () => { Sfx.ensure(); Sfx.setMusic(!Sfx.musicOn); if (Sfx.musicOn) Sfx.startMusic(Game.level ? Game.level.theme.music : 0); syncAudioBtns(); };
    $('#btn-sfx').onclick = () => { Sfx.setSfx(!Sfx.sfxOn); syncAudioBtns(); click(); };
    syncAudioBtns();

    $('#btn-resume').onclick = () => { click(); closeModals(); };
    $('#btn-restart').onclick = () => { click(); closeModals(); request({ to: 'level', n: App.curLevel }); };
    $('#btn-tomap').onclick = () => { click(); closeModals(); request({ to: 'map' }); };
    $('#btn-pause-help').onclick = () => { click(); openModal('mdl-help'); Game.setPaused(true); };
    $('#btn-leave').onclick = () => { click(); closeModals(); leaveAll(); };

    $('#btn-win-next').onclick = () => { click(); closeModals(); request({ to: 'level', n: Math.min(HS.LEVELS, App.curLevel + 1) }); };
    $('#btn-win-replay').onclick = () => { click(); closeModals(); request({ to: 'level', n: App.curLevel }); };
    $('#btn-win-map').onclick = () => { click(); closeModals(); request({ to: 'map' }); };

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (App.screen === 'game') { e.preventDefault(); togglePause(); }
        else if (modalOpen()) closeModals();
      }
    });
  }
  function togglePause() {
    if (Game.state === 'won') return;
    if (modalOpen()) { closeModals(); return; }
    openModal('mdl-pause');
    $('#pause-note').textContent = t(App.mode === 'online' ? 'pause.online' : 'pause.local');
    Game.setPaused(true);
  }
  function onWin(res) {
    const rec = App.prog.done[res.n];
    const isBest = !rec || res.time < (rec.time || 1e9);
    App.prog.done[res.n] = { hearts: Math.max(res.hearts, rec ? rec.hearts || 0 : 0), total: res.total, time: Math.min(res.time, rec ? rec.time || 1e9 : 1e9) };
    App.prog.last = Math.min(HS.LEVELS, res.n + 1);
    saveProg();
    if (App.screen !== 'game') return;
    const msgs = t('win.msgs');
    $('#win-title').textContent = res.n === 100 ? t('win.final') : res.n === 200 ? t('win.finalHard') : res.n === 300 ? t('win.finalNm') : msgs[res.n % msgs.length];
    const ICONS = { fireworks: '🎆', starRain: '🌟', heartSpiral: '💞', unicorn: '🦄', confetti: '🎉', bigHeart: '💖', balloons: '🎈' };
    const icon = $('#win-icon');
    icon.textContent = ICONS[res.celeb] || '💞';
    icon.className = 'win-heart anim-' + (res.celeb || 'heartSpiral');
    let hs = '';
    for (let i = 0; i < res.total; i++) hs += `<span class="hh big ${i < res.hearts ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.18}s">♥</span>`;
    $('#win-hearts').innerHTML = hs;
    $('#win-stats').innerHTML = `<div><b>${fmtTime(res.time)}</b><span>${t('win.time')}${isBest ? t('win.best') : ''}</span></div><div><b>${res.deaths}</b><span>${t('win.restarts')}</span></div><div><b>${res.n}/${HS.LEVELS}</b><span>${t('win.stage')}</span></div>`;
    $('#btn-win-next').style.display = res.n >= HS.LEVELS ? 'none' : '';
    $('#win-note').textContent = App.mode === 'online' && App.role === 'guest' ? t('win.either') : '';
    $('#mdl-win .win-panel').dataset.celeb = res.celeb || '';
    openModal('mdl-win');
  }

  // ---------------- her wardrobe ----------------
  const SWATCH = ['#ff7aa8', '#e8344e', '#ff9a1f', '#ffd24d', '#7bc96f', '#35c6b0', '#4dabf7', '#3b5b9d', '#a58cf0', '#ff8fd0', '#ffffff', '#25232e'];
  let wdTimer = null, wdWho = 'girl';
  const wdSet = (part) => Game.setWardrobe(part, true, wdWho);
  function wdRows() {
    const W = Game.getWardrobe(wdWho), C = W.c, rows = $('#wd-rows');
    rows.innerHTML = '';
    const sec = (label) => { const d = document.createElement('div'); d.className = 'wd-sec'; d.innerHTML = `<h4>${label}</h4><div class="wd-opts"></div>`; rows.appendChild(d); return d.querySelector('.wd-opts'); };
    const opts = (label, names, cur, off, apply) => {
      const box = sec(label);
      names.forEach((n, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'wd-opt' + (cur === i + off ? ' on' : ''); b.textContent = n;
        b.onclick = () => { click(); apply(i + off); wdRows(); };
        box.appendChild(b);
      });
    };
    const colors = (label, cur, key) => {
      const box = sec(label);
      const orig = document.createElement('button');
      orig.type = 'button'; orig.className = 'wd-opt' + (cur ? '' : ' on'); orig.textContent = t('wd.original');
      orig.onclick = () => { click(); wdSet({ c: { [key]: null } }); wdRows(); };
      box.appendChild(orig);
      SWATCH.forEach(col => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'wd-sw' + (cur === col ? ' on' : ''); b.style.background = col; b.title = col;
        b.onclick = () => { click(); wdSet({ c: { [key]: col } }); wdRows(); };
        box.appendChild(b);
      });
      const lab = document.createElement('label');
      lab.className = 'wd-pick' + (cur && !SWATCH.includes(cur) ? ' on' : ''); lab.title = t('wd.custom');
      lab.innerHTML = `<span>🎨</span><input type="color" value="${cur || '#ff7aa8'}">`;
      const inp = lab.querySelector('input');
      let last = 0;
      inp.addEventListener('input', () => { const now = Date.now(); if (now - last < 120) return; last = now; wdSet({ c: { [key]: inp.value } }); });
      inp.addEventListener('change', () => { wdSet({ c: { [key]: inp.value } }); wdRows(); });
      box.appendChild(lab);
    };
    if (wdWho === 'boy') {
      opts(t('wd.top'), t('wd.topOpts'), W.o, 0, (v) => wdSet({ o: v }));
      colors(t('wd.topColor'), C.dress, 'dress');
      colors(t('wd.shoeColor'), C.shoeColor, 'shoeColor');
      return;
    }
    opts(t('wd.dress'), t('wd.dressOpts'), W.o, 0, (v) => wdSet({ o: v }));
    colors(t('wd.dressColor'), C.dress, 'dress');
    opts(t('wd.shoes'), t('wd.shoeOpts'), C.shoe, 0, (v) => wdSet({ c: { shoe: v } }));
    colors(t('wd.shoeColor'), C.shoeColor, 'shoeColor');
    opts(t('wd.hair'), t('wd.hairOpts'), C.hair, -1, (v) => wdSet({ c: { hair: v } }));
    colors(t('wd.hairColor'), C.hairColor, 'hairColor');
    opts(t('wd.hat'), t('wd.hatOpts'), C.hat, -1, (v) => wdSet({ c: { hat: v } }));
    opts(t('wd.crown'), t('wd.crownOpts'), C.crown, -1, (v) => wdSet({ c: { crown: v } }));
  }
  function openWardrobe(who) {
    if (App.screen !== 'game') return;
    wdWho = who === 'boy' ? 'boy' : 'girl';
    click(); openModal('mdl-wardrobe'); Game.setPaused(true);
    wdRows();
    clearInterval(wdTimer);
    const cv = $('#wd-canvas');
    wdTimer = setInterval(() => {
      if ($('#mdl-wardrobe').classList.contains('hidden')) { clearInterval(wdTimer); return; }
      Game.drawWardrobePreview(cv, performance.now() / 1000, wdWho);
    }, 33);
  }
  function initWardrobe() {
    $('#wd-done').onclick = () => { click(); closeModals(); };
    $('#wd-reset').onclick = () => { click(); wdSet({ o: 0, c: { dress: null, shoe: 0, shoeColor: null, hair: -1, hairColor: null, hat: -1, crown: -1 } }); wdRows(); };
  }

  // ---------------- level map ----------------
  const NODE_POS = [[8, 74], [24, 58], [40, 72], [56, 56], [72, 70], [88, 52], [74, 34], [56, 22], [36, 32], [16, 20]];
  function renderMap() {
    const mi = Math.min(HS.MODES.length - 1, Math.floor(App.worldTab / 10));
    const mt = $('#mode-tabs');
    mt.innerHTML = '';
    HS.MODES.forEach((m, k) => {
      let done = 0;
      for (let n = m.from; n <= m.to; n++) if (App.prog.done[n]) done++;
      const b = document.createElement('button');
      b.className = 'mode-tab mode-' + m.id + (k === mi ? ' active' : '');
      b.innerHTML = `<span>${t('mode.' + m.id)}</span><small>${done}/100</small>`;
      b.onclick = () => { click(); App.worldTab = m.worlds[0]; renderMap(); };
      mt.appendChild(b);
    });
    document.body.dataset.mapMode = HS.MODES[mi].id;
    const tabs = $('#world-tabs');
    tabs.innerHTML = '';
    HS.WORLDS.forEach((w, i) => {
      if (i < HS.MODES[mi].worlds[0] || i >= HS.MODES[mi].worlds[1]) return;
      let done = 0;
      for (let k = 1; k <= 10; k++) if (App.prog.done[i * 10 + k]) done++;
      const b = document.createElement('button');
      b.className = 'world-tab' + (i === App.worldTab ? ' active' : '') + (done === 10 ? ' complete' : '');
      b.innerHTML = `<span class="wi">${w.icon}</span><span class="wn">${I18N.worldName(i)}</span><span class="wp">${done}/10</span>`;
      b.onclick = () => { click(); App.worldTab = i; renderMap(); };
      tabs.appendChild(b);
    });
    const wi = App.worldTab, w = HS.WORLDS[wi], th = HS.THEMES[w.theme];
    $('#map-world-name').textContent = `${w.icon} ${I18N.worldName(wi)}`;
    const tt = totals();
    $('#map-stats').textContent = t('map.stats', { done: tt.done, hearts: tt.hearts });
    const path = $('#level-path');
    path.style.background = `linear-gradient(180deg, ${th.sky[0]}, ${th.sky[1]})`;
    path.classList.toggle('dark', !!(th.dark || th.cave || w.theme === 'volcano'));
    let svg = '<svg class="path-line" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="';
    NODE_POS.forEach((p, i) => { svg += (i ? ' L ' : 'M ') + p[0] + ' ' + p[1]; });
    svg += '" /></svg>';
    let html = svg + `<div class="hills" style="--far:${th.far};--mid:${th.mid}"></div>`;
    for (let i = 0; i < 10; i++) {
      const n = wi * 10 + i + 1, rec = App.prog.done[n];
      const isLast = App.prog.last === n;
      const p = NODE_POS[i];
      let hearts = '';
      for (let k = 0; k < 3; k++) hearts += `<i class="${rec && k < (rec.hearts || 0) ? 'on' : ''}">♥</i>`;
      const lname = I18N.levelName(wi, i);
      html += `<button class="lvl ${rec ? 'done' : ''} ${isLast ? 'last' : ''}" style="left:${p[0]}%;top:${p[1]}%;animation-delay:${i * 0.04}s" data-n="${n}" title="${lname}">
        <span class="num">${n}</span><span class="lh">${hearts}</span><span class="ln">${lname}</span>${rec ? `<span class="lt">${fmtTime(rec.time)}</span>` : ''}</button>`;
    }
    path.innerHTML = html;
    path.querySelectorAll('.lvl').forEach(b => b.onclick = () => { click(); request({ to: 'level', n: +b.dataset.n }); });
    const cont = App.prog.last && App.prog.last >= 1 ? App.prog.last : nextUnfinished();
    $('#btn-continue').textContent = t('map.play', { n: cont });
    $('#btn-continue').onclick = () => { click(); request({ to: 'level', n: cont }); };
    $('#map-note').textContent = t(App.mode === 'online' ? (App.role === 'host' ? 'map.noteHost' : 'map.noteGuest') : 'map.noteLocal');
  }
  function initMap() {
    $('#btn-map-back').onclick = () => { click(); request({ to: 'lobby' }); };
  }

  // ---------------- boot ----------------
  window.addEventListener('DOMContentLoaded', () => {
    Game.init($('#game'));
    initLang(); initMenu(); initLobby(); initHud(); initMap(); initChat(); initWardrobe();
    App.worldTab = Math.floor(((App.prog.last || 1) - 1) / 10);
    if (App.screen === 'menu') show('menu');
    // shortcut: ?play=12 jumps straight into stage 12 on one keyboard
    const play = parseInt(new URLSearchParams(location.search).get('play'), 10);
    if (play >= 1 && play <= HS.LEVELS) { App.mode = 'local'; App.lobby = { boy: 'p1', girl: 'p2' }; startGame(play); }
    const mapW = parseInt(new URLSearchParams(location.search).get('map'), 10);
    if (mapW >= 1 && mapW <= HS.WORLDS.length) { App.mode = 'local'; App.lobby = { boy: 'p1', girl: 'p2' }; App.worldTab = mapW - 1; show('map'); renderMap(); }
    window.addEventListener('beforeunload', () => { try { Net.leave(); } catch (e) { /* ignore */ } });
  });
  window.App = App;
})();
