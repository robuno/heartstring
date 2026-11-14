/* Heartstring — menus, lobby (room codes), character select, level map, HUD. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const HS = window.HS, Game = window.Game, Net = window.Net, Sfx = window.Sfx;

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
    for (let n = 1; n <= 100; n++) if (!App.prog.done[n]) return n;
    return 100;
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
  function myName() { return (App.name || '').trim() || (App.myChar === 'girl' ? 'Her' : App.myChar === 'boy' ? 'Him' : 'Player'); }

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
      $('#join-status').textContent = 'Invite found! Type your name on the main menu if you like, then press Join.';
    }
  }

  // ---------------- online: host / join ----------------
  function requirePeer() {
    if (!Net.available()) { toast('Online library failed to load. Check your internet connection and refresh.', 'err'); return false; }
    return true;
  }
  function hostRoom() {
    if (!requirePeer()) return;
    App.mode = 'online'; App.role = 'host'; App.lobby = { boy: null, girl: null }; App.partnerName = ''; App.myChar = null;
    show('lobby'); renderLobby();
    $('#room-code').textContent = '·····';
    $('#lobby-status').textContent = 'Creating your room…';
    wireNet();
    Net.host();
  }
  function joinRoom(code) {
    code = (code || '').toUpperCase().trim();
    if (code.length < 5) { $('#join-status').textContent = 'Room codes have 5 characters.'; return; }
    if (!requirePeer()) return;
    App.mode = 'online'; App.role = 'guest'; App.lobby = { boy: null, girl: null }; App.partnerName = ''; App.myChar = null;
    $('#join-status').textContent = 'Connecting…';
    wireNet();
    Net.join(code);
  }

  function wireNet() {
    Net.on('ready', (code) => {
      $('#room-code').textContent = code;
      $('#lobby-status').innerHTML = 'Send this code (or the invite link) to your partner. Waiting for them to join… <span class="dots"></span>';
      // host gets first pick by default: nothing chosen yet
    });
    Net.on('connected', () => {
      Sfx.play('cp');
      if (App.role === 'guest') {
        Net.send({ t: 'hello', name: App.name, prog: App.prog });
        show('lobby'); renderLobby();
        $('#room-code').textContent = Net.code;
        $('#lobby-status').textContent = 'Connected! Pick your character 💞';
      } else {
        $('#lobby-status').textContent = 'Your partner joined! Pick your characters 💞';
      }
      startPing();
    });
    Net.on('data', onData);
    Net.on('disconnected', () => {
      stopPing();
      toast('Your partner disconnected 💔', 'err');
      if (App.role === 'host') {
        App.lobby = { boy: App.lobby.boy === 'host' ? 'host' : null, girl: App.lobby.girl === 'host' ? 'host' : null };
        App.partnerName = '';
        Game.stop(); show('lobby'); renderLobby();
        $('#lobby-status').innerHTML = 'Waiting for your partner to re-join with the same code… <span class="dots"></span>';
      } else {
        Game.stop(); Net.leave(); show('menu');
      }
    });
    Net.on('error', (e) => {
      const msg = (e && e.message) || 'Connection problem.';
      if (App.screen === 'join') $('#join-status').textContent = msg;
      else toast(msg, 'err');
      if (App.role === 'host' && App.screen === 'lobby' && !Net.connected()) $('#lobby-status').textContent = 'Could not create the room: ' + msg;
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
        toast('That room already has two players.', 'err'); Net.leave(); show('menu'); break;
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
      if (who === 'host') toast('Your partner already picked that one.');
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
        if (owner === App.role) { label = 'You' + (App.name ? ' · ' + App.name : ''); card.classList.add('mine'); }
        else if (owner) { label = (App.partnerName || 'Partner'); card.classList.add('theirs'); }
        else label = 'Click to pick';
      } else {
        label = owner === 'p1' ? 'Player 1 · WASD + E' : 'Player 2 · Arrows + R-Shift';
        card.classList.add(owner === 'p1' ? 'mine' : 'theirs');
      }
      card.querySelector('.char-owner').textContent = label;
    });
    const ready = online ? (App.lobby.boy && App.lobby.girl && Net.connected()) : true;
    const btn = $('#btn-lobby-go');
    btn.disabled = !ready;
    btn.textContent = online && App.role === 'guest' ? 'Open level map →' : 'Choose a level →';
    if (online && Net.connected() && !ready) $('#lobby-status').textContent = 'Both players pick a character to continue.';
    else if (online && ready) $('#lobby-status').textContent = 'Ready! ' + (App.partnerName ? App.partnerName + ' is here 💞' : 'Your partner is here 💞');
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
    $('#btn-copy-code').onclick = () => copy(Net.code || $('#room-code').textContent, 'Code copied!');
    $('#btn-copy-link').onclick = () => {
      const url = location.origin + location.pathname + '?room=' + (Net.code || '');
      copy(url, 'Invite link copied — send it to your partner!');
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
      if (m.to === 'level' && !(App.lobby.boy && App.lobby.girl)) { toast('Both players need a character first.'); return; }
      Net.send(Object.assign({ t: 'nav' }, m));
    }
    doNav(m);
  }
  function handleReq(m) {
    if (!['map', 'level', 'lobby'].includes(m.to)) return;
    if (m.to === 'level') { const n = m.n | 0; if (n < 1 || n > 100) return; }
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
    n = Math.max(1, Math.min(100, n));
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
    const names = { [myChar]: myName(), [partner]: App.partnerName || (partner === 'girl' ? 'Her' : 'Him') };
    show('game');
    Game.startLevel(n, { mode: App.mode, myChar, schemes, names, net: App.mode === 'online' ? Net : null, music: Sfx.musicOn });
    const L = Game.level;
    $('#hud-world').textContent = L.world.icon;
    $('#hud-level').textContent = `${n}. ${L.name}`;
    renderHearts(0, L.hearts.length);
    const hint = App.mode === 'online'
      ? 'Move A/D ←/→ · Jump W/↑/Space · Anchor S/↓ · Climb string E · Kiss K 💋 · Emotes 1-4 · Menu Esc'
      : 'P1: WASD · E climb · F kiss   |   P2: Arrows · R-Shift climb · L kiss   |   Down = Anchor · Esc = Menu';
    const h = $('#hud-hint'); h.textContent = hint; h.classList.remove('fade'); void h.offsetWidth; h.classList.add('fade');
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

    $('#btn-win-next').onclick = () => { click(); closeModals(); request({ to: 'level', n: Math.min(100, App.curLevel + 1) }); };
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
    $('#pause-note').textContent = App.mode === 'online' ? 'The world keeps moving online — Restart and Level Map affect both of you.' : 'Game paused.';
    Game.setPaused(true);
  }
  function onWin(res) {
    const rec = App.prog.done[res.n];
    const isBest = !rec || res.time < (rec.time || 1e9);
    App.prog.done[res.n] = { hearts: Math.max(res.hearts, rec ? rec.hearts || 0 : 0), total: res.total, time: Math.min(res.time, rec ? rec.time || 1e9 : 1e9) };
    App.prog.last = Math.min(100, res.n + 1);
    saveProg();
    if (App.screen !== 'game') return;
    const msgs = ['Perfect teamwork!', 'You two are unstoppable!', 'Hearts in sync 💞', 'What a duo!', 'Love conquers all (even spikes)!', 'Better together!'];
    $('#win-title').textContent = res.n === 100 ? 'You reached the Heart Summit! 💖' : msgs[res.n % msgs.length];
    let hs = '';
    for (let i = 0; i < res.total; i++) hs += `<span class="hh big ${i < res.hearts ? 'on' : ''}">♥</span>`;
    $('#win-hearts').innerHTML = hs;
    $('#win-stats').innerHTML = `<div><b>${fmtTime(res.time)}</b><span>time${isBest ? ' · best!' : ''}</span></div><div><b>${res.deaths}</b><span>restarts</span></div><div><b>${res.n}/100</b><span>stage</span></div>`;
    $('#btn-win-next').style.display = res.n >= 100 ? 'none' : '';
    $('#win-note').textContent = App.mode === 'online' && App.role === 'guest' ? 'Either of you can pick what is next.' : '';
    openModal('mdl-win');
  }

  // ---------------- level map ----------------
  const NODE_POS = [[8, 74], [24, 58], [40, 72], [56, 56], [72, 70], [88, 52], [74, 34], [56, 22], [36, 32], [16, 20]];
  function renderMap() {
    const tabs = $('#world-tabs');
    tabs.innerHTML = '';
    HS.WORLDS.forEach((w, i) => {
      let done = 0;
      for (let k = 1; k <= 10; k++) if (App.prog.done[i * 10 + k]) done++;
      const b = document.createElement('button');
      b.className = 'world-tab' + (i === App.worldTab ? ' active' : '') + (done === 10 ? ' complete' : '');
      b.innerHTML = `<span class="wi">${w.icon}</span><span class="wn">${w.name}</span><span class="wp">${done}/10</span>`;
      b.onclick = () => { click(); App.worldTab = i; renderMap(); };
      tabs.appendChild(b);
    });
    const wi = App.worldTab, w = HS.WORLDS[wi], th = HS.THEMES[w.theme];
    $('#map-world-name').textContent = `${w.icon} ${w.name}`;
    const tt = totals();
    $('#map-stats').textContent = `${tt.done}/100 stages cleared · ${tt.hearts} hearts collected`;
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
      html += `<button class="lvl ${rec ? 'done' : ''} ${isLast ? 'last' : ''}" style="left:${p[0]}%;top:${p[1]}%" data-n="${n}" title="${HS.NAMES[wi][i]}">
        <span class="num">${n}</span><span class="lh">${hearts}</span><span class="ln">${HS.NAMES[wi][i]}</span>${rec ? `<span class="lt">${fmtTime(rec.time)}</span>` : ''}</button>`;
    }
    path.innerHTML = html;
    path.querySelectorAll('.lvl').forEach(b => b.onclick = () => { click(); request({ to: 'level', n: +b.dataset.n }); });
    const cont = App.prog.last && App.prog.last >= 1 ? App.prog.last : nextUnfinished();
    $('#btn-continue').textContent = `Play stage ${cont} ▶`;
    $('#btn-continue').onclick = () => { click(); request({ to: 'level', n: cont }); };
    $('#map-note').textContent = App.mode === 'online'
      ? (App.role === 'host' ? 'Every stage is open — pick any one and you both jump in.' : 'Every stage is open — pick one and you will both start there.')
      : 'Every stage is open — start anywhere, any time. Progress is saved in this browser.';
  }
  function initMap() {
    $('#btn-map-back').onclick = () => { click(); request({ to: 'lobby' }); };
  }

  // ---------------- boot ----------------
  window.addEventListener('DOMContentLoaded', () => {
    Game.init($('#game'));
    initMenu(); initLobby(); initHud(); initMap();
    App.worldTab = Math.floor(((App.prog.last || 1) - 1) / 10);
    if (App.screen === 'menu') show('menu');
    // shortcut: ?play=12 jumps straight into stage 12 on one keyboard
    const play = parseInt(new URLSearchParams(location.search).get('play'), 10);
    if (play >= 1 && play <= 100) { App.mode = 'local'; App.lobby = { boy: 'p1', girl: 'p2' }; startGame(play); }
    const mapW = parseInt(new URLSearchParams(location.search).get('map'), 10);
    if (mapW >= 1 && mapW <= 10) { App.mode = 'local'; App.lobby = { boy: 'p1', girl: 'p2' }; App.worldTab = mapW - 1; show('map'); renderMap(); }
    window.addEventListener('beforeunload', () => { try { Net.leave(); } catch (e) { /* ignore */ } });
  });
  window.App = App;
})();
