/* Heartstring — game engine: physics, the red string, co-op mechanics, rendering. */
(function (global) {
  'use strict';
  const HS = global.HS, T = HS.TILE;
  const Sfx = global.Sfx || { play() {}, startMusic() {} };

  // ---------- tuning ----------
  const P = { G: 2100, JUMP: 700, MAXFALL: 980, RUN: 235, ACC_G: 2800, ACC_A: 1600, ACC_ICE: 520, BOUNCE: 1080, CONVEY: 120, UPDRAFT: 3900, UPMAX: 420, COYOTE: 0.1, BUF: 0.13 };
  const ROPE_MAX = 7 * T, ROPE_MIN = 26, REEL = 180, UNREEL = 260;
  const PW = 22, PH = 28;
  const DT = 1 / 120;
  const VIEW_TILES_H = 14.5;
  const ROPE_N = 18;

  const KEYMAPS = {
    p1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], anchor: ['KeyS'], reel: ['KeyE'], emote: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], kiss: ['KeyF'] },
    p2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], anchor: ['ArrowDown'], reel: ['ShiftRight', 'Slash', 'Period', 'Numpad0'], emote: ['Digit7', 'Digit8', 'Digit9', 'Digit0'], kiss: ['KeyL', 'Numpad1'] },
    solo: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp', 'Space'], anchor: ['KeyS', 'ArrowDown', 'ShiftLeft'], reel: ['KeyE', 'ShiftRight', 'KeyQ'], emote: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], kiss: ['KeyK', 'KeyF'] },
  };
  const EMOTES = ['❤️', '👋 Here!', '✋ Wait!', '⬆️ Jump!'];

  const LOOK = {
    boy: { body: '#4f8ff0', bodyDark: '#3a6fc4', hair: '#4a2f22', skin: '#ffd8bd', shoe: '#2d3a5a', accent: '#8fd0ff' },
    girl: { body: '#ff7aa8', bodyDark: '#e0578a', hair: '#1b1820', skin: '#ffe0c8', shoe: '#7a2e52', accent: '#ffd0e2', bow: '#ff3f7f' },
  };
  const GROUP_COLORS = { a: '#35c6b0', b: '#ff9f43', L: '#ffc933' };

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
  const other = (ch) => ch === 'boy' ? 'girl' : 'boy';

  function makePlayer(char) {
    return {
      char, x: 0, y: 0, w: PW, h: PH, vx: 0, vy: 0, face: char === 'boy' ? 1 : -1,
      grounded: false, groundChar: null, gMover: null, onPartner: false,
      anchored: false, wallSide: 0, wallGrabOk: true, coyote: 0, jumpBuf: 0, jumpCut: false, bounced: false,
      reel: 0, prevX: 0, prevY: 0, lastDx: 0, lastDy: 0, squash: 0, walkT: 0, blinkT: Math.random() * 3,
      emote: null, emoteT: 0, inUpdraft: false, local: true, ropeHang: 0,
      tx: undefined, ty: undefined, nvx: 0, nvy: 0, netAge: 0, reelSfx: 0,
    };
  }

  const G = {
    canvas: null, ctx: null, cw: 0, ch: 0, dpr: 1, zoom: 2, cam: { x: 0, y: 0 },
    state: 'menu', mode: 'local', myChar: 'boy', names: {}, schemes: {}, net: null,
    L: null, t: 0, time: 0, deaths: 0, cp: 0, respawnT: 0, ropeGrace: 0,
    open: {}, latched: {}, doorAnim: {}, crumble: new Map(), bounceAnim: new Map(),
    players: null, rope: [], particles: [], ambient: [], netAcc: 0, winT: 0, paused: false,
    keys: new Set(), jumpQ: { boy: false, girl: false }, hooks: {}, ping: null, hudAcc: 0,
    menuT: 0, ropeTension: 0, introT: 0, spr: new Map(), sprKey: '',
  };

  // =====================================================================
  //  Tiles & collision
  // =====================================================================
  function tileAt(tx, ty) {
    const L = G.L;
    if (tx < 0 || tx >= L.W) return '#';
    if (ty < 0) return '.';
    if (ty >= L.H) return L.grid[L.H - 1][tx];
    return L.grid[ty][tx];
  }
  function isBroken(tx, ty) { const s = G.crumble.get(ty * G.L.W + tx); return !!(s && s.broken); }
  function doorOpen(tx, ty) { const g = G.L.doorGroup[ty * G.L.W + tx]; return !!G.open[g]; }

  function solidAt(tx, ty, p) {
    const c = tileAt(tx, ty);
    switch (c) {
      case '#': case 'I': case 'B': case '<': case '>': return true;
      case 'C': return !isBroken(tx, ty);
      case 'D': case 'K': case 'Q': return !doorOpen(tx, ty);
      case 'b': return !!p && p.char === 'girl';
      case 'g': return !!p && p.char === 'boy';
      default: return false;
    }
  }
  function overlapTile(x, y, w, h, tx, ty) {
    return x < (tx + 1) * T && x + w > tx * T && y < (ty + 1) * T && y + h > ty * T;
  }
  // only doors / gates / crumbling stones may be "passed through" when you are already inside them;
  // static ground never is (that was what let players sink into the soil)
  function ignorable(tx, ty, x, y, w, h) {
    return 'DKQCbg'.includes(tileAt(tx, ty)) && overlapTile(x, y, w, h, tx, ty);
  }
  // push a player out of any static ground they ended up inside (after being carried / pulled)
  function depenetrate(p) {
    for (let it = 0; it < 4; it++) {
      const x0 = Math.floor((p.x + 0.5) / T), x1 = Math.floor((p.x + p.w - 0.5) / T);
      const y0 = Math.floor((p.y + 0.5) / T), y1 = Math.floor((p.y + p.h - 0.5) / T);
      let hx = -1, hy = -1;
      for (let ty = y0; ty <= y1 && hx < 0; ty++) for (let tx = x0; tx <= x1; tx++) {
        const c = tileAt(tx, ty);
        if ('#IB<>'.includes(c) || (c === 'C' && !isBroken(tx, ty))) { hx = tx; hy = ty; break; }
      }
      if (hx < 0) return;
      const up = p.y + p.h - hy * T, down = (hy + 1) * T - p.y, left = p.x + p.w - hx * T, right = (hx + 1) * T - p.x;
      if (up <= 16 && !solidAt(hx, hy - 1, p)) { p.y = hy * T - p.h; if (p.vy > 0) p.vy = 0; continue; }
      const m = Math.min(up, down, left, right);
      if (m === left) p.x = hx * T - p.w;
      else if (m === right) p.x = (hx + 1) * T;
      else if (m === down) { p.y = (hy + 1) * T; if (p.vy < 0) p.vy = 0; }
      else { p.y = hy * T - p.h; if (p.vy > 0) p.vy = 0; }
    }
  }

  function stepX(p, dx) {
    const ox = p.x; p.x += dx;
    const y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + p.h - 0.001) / T);
    if (dx > 0) {
      const tx = Math.floor((p.x + p.w - 0.001) / T);
      for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty, p) && !ignorable(tx, ty, ox, p.y, p.w, p.h)) { p.x = tx * T - p.w; p.vx = 0; return true; }
    } else if (dx < 0) {
      const tx = Math.floor(p.x / T);
      for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty, p) && !ignorable(tx, ty, ox, p.y, p.w, p.h)) { p.x = (tx + 1) * T; p.vx = 0; return true; }
    }
    return false;
  }
  function moveX(p, dx) {
    if (!dx) return false;
    const n = Math.max(1, Math.ceil(Math.abs(dx) / 10)), s = dx / n;
    for (let i = 0; i < n; i++) if (stepX(p, s)) return true;
    return false;
  }

  function stepY(p, dy) {
    const oy = p.y, prevBottom = oy + p.h;
    p.y += dy;
    const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w - 0.001) / T);
    if (dy > 0) {
      const bottom = p.y + p.h, ty = Math.floor((bottom - 0.001) / T);
      let best = Infinity, info = null;
      for (let tx = x0; tx <= x1; tx++) {
        const c = tileAt(tx, ty);
        if (solidAt(tx, ty, p) && !ignorable(tx, ty, p.x, oy, p.w, p.h)) {
          if (ty * T < best) { best = ty * T; info = { c, tx, ty }; }
        } else if (c === '=' && prevBottom <= ty * T + 0.01) {
          if (ty * T < best) { best = ty * T; info = { c, tx, ty }; }
        }
      }
      for (const m of G.L.movers) {
        if (p.x + p.w > m.x + 1 && p.x < m.x + m.w - 1 && prevBottom <= m.y + 0.6 && bottom >= m.y && m.y < best) {
          best = m.y; info = { c: 'm', mover: m };
        }
      }
      const o = G.players[other(p.char)];
      if (o && !G.respawnT && p.x + p.w > o.x + 3 && p.x < o.x + o.w - 3 && prevBottom <= o.y + 2 && bottom >= o.y && o.y < best) {
        best = o.y; info = { c: 'p', partner: true };
      }
      if (info) {
        p.y = best - p.h;
        if (p.vy > 0) p.vy = 0;
        p.grounded = true;
        p.groundChar = info.c;
        p.groundTile = info.tx !== undefined ? info : null;
        p.gMover = info.mover || null;
        p.onPartner = !!info.partner;
        return true;
      }
    } else if (dy < 0) {
      const ty = Math.floor(p.y / T);
      for (let tx = x0; tx <= x1; tx++) {
        if (solidAt(tx, ty, p) && !ignorable(tx, ty, p.x, oy, p.w, p.h)) { p.y = (ty + 1) * T; if (p.vy < 0) p.vy = 0; return true; }
      }
    }
    return false;
  }
  function moveY(p, dy) {
    if (!dy) return false;
    const n = Math.max(1, Math.ceil(Math.abs(dy) / 10)), s = dy / n;
    for (let i = 0; i < n; i++) if (stepY(p, s)) return true;
    return false;
  }

  function hasGround(p) {
    const fy = p.y + p.h + 1, ty = Math.floor(fy / T);
    const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w - 0.001) / T);
    for (let tx = x0; tx <= x1; tx++) {
      if (solidAt(tx, ty, p)) return true;
      if (tileAt(tx, ty) === '=' && p.y + p.h <= ty * T + 1.5) return true;
    }
    for (const m of G.L.movers) if (p.x + p.w > m.x && p.x < m.x + m.w && Math.abs(p.y + p.h - m.y) < 3) return true;
    const o = G.players[other(p.char)];
    if (o && p.x + p.w > o.x + 3 && p.x < o.x + o.w - 3 && Math.abs(p.y + p.h - o.y) < 3) return true;
    return false;
  }

  function wallTouch(p) {
    const y0 = Math.floor((p.y + 4) / T), y1 = Math.floor((p.y + p.h - 4) / T);
    const check = (tx) => {
      for (let ty = y0; ty <= y1; ty++) if (solidAt(tx, ty, p) && tileAt(tx, ty) !== 'I') return true;
      return false;
    };
    const l = check(Math.floor((p.x - 2) / T)), r = check(Math.floor((p.x + p.w + 2) / T));
    if (l && r) return p.face;
    return r ? 1 : l ? -1 : 0;
  }

  function inUpdraft(p) {
    const cx = p.x + p.w / 2;
    return tileAt(Math.floor(cx / T), Math.floor((p.y + p.h * 0.5) / T)) === 'U' || tileAt(Math.floor(cx / T), Math.floor((p.y + p.h - 2) / T)) === 'U';
  }

  // =====================================================================
  //  Input
  // =====================================================================
  function anyKey(list) { for (const k of list) if (G.keys.has(k)) return true; return false; }
  function readInput(ch) {
    const sc = G.schemes[ch];
    if (!sc || G.paused || G.state !== 'play' || G.introT > 0 || G.kissT > 0.35) { G.jumpQ[ch] = false; return { left: false, right: false, jump: false, anchor: false, reel: false, jumpQ: false }; }
    const km = KEYMAPS[sc];
    const q = G.jumpQ[ch]; G.jumpQ[ch] = false;
    return { left: anyKey(km.left), right: anyKey(km.right), jump: anyKey(km.jump), anchor: anyKey(km.anchor), reel: anyKey(km.reel), jumpQ: q };
  }
  function onKeyDown(e) {
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    G.keys.add(e.code);
    if (G.state === 'play' && !G.paused) {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      for (const ch of ['boy', 'girl']) {
        const sc = G.schemes[ch]; if (!sc) continue;
        const km = KEYMAPS[sc];
        if (km.jump.includes(e.code)) G.jumpQ[ch] = true;
        const ei = km.emote.indexOf(e.code);
        if (ei >= 0) doEmote(ch, ei, true);
        if (km.kiss.includes(e.code)) tryKiss();
      }
    }
  }
  function onKeyUp(e) { G.keys.delete(e.code); }

  // =====================================================================
  //  Level lifecycle
  // =====================================================================
  function startLevel(n, cfg) {
    const L = HS.buildLevel(n);
    G.L = L;
    G.mode = cfg.mode; G.myChar = cfg.myChar || 'boy'; G.names = cfg.names || {}; G.schemes = cfg.schemes || {}; G.net = cfg.net || null;
    G.t = 0; G.time = 0; G.deaths = 0; G.cp = 0; G.respawnT = 0; G.ropeGrace = 0.3; G.winT = 0; G.paused = false;
    G.open = {}; G.latched = {}; G.doorAnim = {}; G.crumble = new Map(); G.bounceAnim = new Map(); G.particles = [];
    G.jumpQ = { boy: false, girl: false }; G.introT = 1.2; G.ping = null; G.kissT = 0;
    G.players = { boy: makePlayer('boy'), girl: makePlayer('girl') };
    if (G.mode === 'online') { G.players.boy.local = G.myChar === 'boy'; G.players.girl.local = G.myChar === 'girl'; }
    for (const m of L.movers) { m.x = m.x0; m.y = m.y0; m.dx = 0; m.dy = 0; }
    updateMovers(true);
    placeAtCheckpoint();
    G.state = 'play';
    G.sprKey = '';
    initAmbient();
    snapCamera();
    if (cfg.music !== false) Sfx.startMusic && Sfx.startMusic(L.theme.music);
  }

  function stop() { G.state = 'menu'; G.L = null; G.players = null; G.paused = false; }

  function cpSpawn(ch) {
    const cp = G.L.checkpoints[G.cp] || G.L.checkpoints[0];
    return { x: cp.x + (ch === 'boy' ? -18 : 18) - PW / 2, y: cp.y - PH };
  }

  function placeAtCheckpoint() {
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch], s = cpSpawn(ch);
      p.x = s.x; p.y = s.y; p.vx = p.vy = 0; p.anchored = false; p.reel = 0; p.wallSide = 0;
      p.prevX = p.x; p.prevY = p.y; p.lastDx = p.lastDy = 0; p.grounded = false; p.gMover = null; p.onPartner = false;
      p.face = ch === 'boy' ? 1 : -1;
      if (!p.local) { p.tx = p.x; p.ty = p.y; p.nvx = p.nvy = 0; p.netAge = 0; }
    }
    G.ropeGrace = 0.6;
    initRope();
  }

  function startRespawn(send) {
    if (G.respawnT > 0 || G.state !== 'play') return;
    G.respawnT = 0.85; G.deaths++;
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      for (let i = 0; i < 14; i++) spawnParticle(p.x + PW / 2, p.y + PH / 2, (Math.random() - 0.5) * 300, (Math.random() - 0.9) * 300, 0.7, ch === 'boy' ? LOOK.boy.body : LOOK.girl.body, 3 + Math.random() * 3, 'dot', 600);
    }
    Sfx.play('die');
    if (send) netSend({ t: 'die' });
  }

  // =====================================================================
  //  Simulation step
  // =====================================================================
  function step(dt) {
    const L = G.L;
    G.t += dt;
    if (G.state === 'play' && G.introT <= 0) G.time += dt;
    G.introT = Math.max(0, G.introT - dt);
    if (G.kissT > 0) {
      G.kissT = Math.max(0, G.kissT - dt);
      if (Math.random() < dt * 22) {
        const m = kissMid();
        spawnParticle(m.x + (Math.random() - 0.5) * 30, m.y - 10, (Math.random() - 0.5) * 70, -60 - Math.random() * 90, 1.4, Math.random() < 0.5 ? '#ff5d8f' : '#ffc2d4', 4 + Math.random() * 5, 'heart', -20);
      }
    }
    updateMovers(false);
    updateSaws();
    let frozen = false;
    if (G.respawnT > 0) {
      const before = G.respawnT;
      G.respawnT -= dt;
      if (before > 0.42 && G.respawnT <= 0.42) placeAtCheckpoint();
      if (G.respawnT < 0) G.respawnT = 0;
      frozen = G.respawnT > 0.3;
    }
    G.ropeGrace = Math.max(0, G.ropeGrace - dt);
    updateGroups(dt);
    updateCrumble();

    for (const ch of ['boy', 'girl']) { const p = G.players[ch]; if (p.local) { p.prevX = p.x; p.prevY = p.y; } }
    for (const ch of ['boy', 'girl']) { const p = G.players[ch]; if (!p.local) updateRemote(p, dt); }
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      if (!p.local) continue;
      const inp = readInput(ch);
      if (!frozen) updatePlayer(p, inp, dt);
    }
    if (!frozen && G.ropeGrace <= 0) solveRope();
    else G.ropeTension = 0;

    if (!frozen && G.state === 'play') {
      for (const ch of ['boy', 'girl']) {
        const p = G.players[ch];
        if (!p.local) continue;
        if (checkHazards(p)) { startRespawn(true); break; }
        checkPickups(p);
      }
      checkGoal();
    }
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      if (p.local) { p.lastDx = p.x - p.prevX; p.lastDy = p.y - p.prevY; }
      p.squash *= Math.pow(0.0005, dt);
      if (p.emoteT > 0) p.emoteT -= dt;
      p.blinkT -= dt; if (p.blinkT < -0.12) p.blinkT = 2 + Math.random() * 3;
    }
    if (G.state === 'won') {
      G.winT += dt;
      for (const ch of ['boy', 'girl']) {
        const p = G.players[ch];
        if (p.local && p.grounded && Math.random() < dt * 2.2) { p.vy = -420; p.grounded = false; }
      }
      if (Math.random() < dt * 14) {
        const g = L.goal;
        spawnParticle(g.x + (Math.random() - 0.5) * 120, g.y - 40 - Math.random() * 60, (Math.random() - 0.5) * 60, -60 - Math.random() * 80, 1.6, Math.random() < 0.5 ? '#ff5d8f' : '#ffb3c7', 7 + Math.random() * 6, 'heart', -30);
      }
    }
    updateRopeVisual(dt);
    updateParticles(dt);
  }

  function updateMovers(init) {
    for (const m of G.L.movers) {
      const f = (1 - Math.cos((G.t / m.period + m.phase) * Math.PI * 2)) / 2;
      const nx = m.x0 + m.ax * f * T, ny = m.y0 + m.ay * f * T;
      m.dx = init ? 0 : clamp(nx - m.x, -20, 20); m.dy = init ? 0 : clamp(ny - m.y, -20, 20);
      m.x = nx; m.y = ny;
    }
  }
  function updateSaws() {
    for (const s of G.L.saws) {
      if (!s.ay) continue;
      const f = (1 - Math.cos((G.t / s.period + s.phase) * Math.PI * 2)) / 2;
      s.y = s.y0 + s.ay * f * T;
    }
  }

  function platePressed(pl) {
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      const b = p.y + p.h;
      if (b >= pl.y + 16 && b <= pl.y + T + 4 && p.x + p.w > pl.x + 3 && p.x < pl.x + T - 3) return true;
    }
    return false;
  }

  function updateGroups(dt) {
    const L = G.L;
    const any = {};
    for (const pl of L.plates) {
      const d = G.respawnT > 0.3 ? false : platePressed(pl);
      if (d && !pl.down) Sfx.play('plate');
      pl.down = d;
      if (d) any[pl.group] = true;
    }
    for (const key in L.groups) {
      const g = L.groups[key];
      const was = !!G.open[key];
      if (g.kind === 'any') G.open[key] = !!any[key];
      else {
        if (!G.latched[key] && g.plates.length && g.plates.every(p => p.down)) latch(key, true);
        G.open[key] = !!G.latched[key];
      }
      if (G.open[key] !== was) Sfx.play('door');
      G.doorAnim[key] = approach(G.doorAnim[key] || 0, G.open[key] ? 1 : 0, dt * 5);
    }
  }
  function latch(key, send) {
    if (G.latched[key]) return;
    G.latched[key] = true;
    Sfx.play('latch');
    const L = G.L;
    for (const idx in L.doorGroup) if (L.doorGroup[idx] === key) {
      const tx = idx % L.W, ty = Math.floor(idx / L.W);
      for (let i = 0; i < 4; i++) spawnParticle(tx * T + 16, ty * T + 16, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 0.8, '#ffd35a', 3, 'star', 0);
    }
    if (send) netSend({ t: 'latch', g: key });
  }

  function updateCrumble() {
    const L = G.L;
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      if (!p.grounded || G.respawnT > 0) continue;
      const ty = Math.floor((p.y + p.h + 1) / T);
      const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w - 0.001) / T);
      for (let tx = x0; tx <= x1; tx++) {
        if (tileAt(tx, ty) === 'C') {
          const k = ty * L.W + tx;
          if (!G.crumble.has(k)) G.crumble.set(k, { t: G.t, broken: false });
        }
      }
    }
    for (const [k, s] of G.crumble) {
      if (!s.broken && G.t - s.t > 0.5) {
        s.broken = true; s.restore = G.t + 3.5;
        const tx = k % L.W, ty = Math.floor(k / L.W);
        for (let i = 0; i < 6; i++) spawnParticle(tx * T + Math.random() * T, ty * T + Math.random() * 12, (Math.random() - 0.5) * 80, Math.random() * 60, 0.9, L.theme.groundDark, 4 + Math.random() * 3, 'rock', 900);
        Sfx.play('crumble');
      } else if (s.broken && G.t > s.restore) {
        const tx = k % L.W, ty = Math.floor(k / L.W);
        let blocked = false;
        for (const ch of ['boy', 'girl']) { const p = G.players[ch]; if (overlapTile(p.x, p.y, p.w, p.h, tx, ty)) blocked = true; }
        if (!blocked) G.crumble.delete(k);
      }
    }
  }

  function updateRemote(p, dt) {
    p.prevX = p.x; p.prevY = p.y;
    if (p.tx === undefined) return;
    p.netAge += dt;
    const age = Math.min(p.netAge, 0.12);
    const ex = p.tx + p.nvx * age, ey = p.ty + (p.grounded || p.anchored ? 0 : p.nvy * age);
    const d = Math.hypot(ex - p.x, ey - p.y);
    if (d > T * 5) { p.x = ex; p.y = ey; }
    else { const k = Math.min(1, dt * 20); p.x += (ex - p.x) * k; p.y += (ey - p.y) * k; }
    p.vx = p.nvx; p.vy = p.nvy;
    if (p.grounded && Math.abs(p.vx) > 20) p.walkT += dt * Math.abs(p.vx) / 30;
    p.lastDx = p.x - p.prevX; p.lastDy = p.y - p.prevY;
  }

  function updatePlayer(p, inp, dt) {
    // carried by platform / partner
    if (p.gMover) {
      moveX(p, p.gMover.dx);
      if (p.gMover.dy < 0) p.y += p.gMover.dy; else moveY(p, p.gMover.dy);
    } else if (p.onPartner) {
      const o = G.players[other(p.char)];
      moveX(p, clamp(o.lastDx, -12, 12));
      moveY(p, clamp(o.lastDy, -12, 12));
    }
    depenetrate(p);

    // reel the string in / out
    if (inp.reel) {
      p.reel = Math.min(ROPE_MAX - ROPE_MIN, p.reel + REEL * dt);
      p.reelSfx -= dt; if (p.reelSfx <= 0 && p.reel < ROPE_MAX - ROPE_MIN) { Sfx.play('reel'); p.reelSfx = 0.08; }
    } else p.reel = Math.max(0, p.reel - UNREEL * dt);

    p.coyote -= dt; p.jumpBuf -= dt;
    if (inp.jumpQ) p.jumpBuf = P.BUF;
    // hanging from an anchored partner: you can kick off the string
    if (p.ropeHang > 0) { p.ropeHang -= dt; if (!p.grounded) { p.coyote = Math.max(p.coyote, 0.05); p.wallGrabOk = true; } }

    // anchoring
    if (inp.anchor) {
      if (!p.anchored) {
        if (p.grounded && p.groundChar !== 'I' && hasGround(p)) {
          p.anchored = true; p.wallSide = 0; p.vx = 0; p.vy = 0; Sfx.play('anchor');
          for (let i = 0; i < 5; i++) spawnParticle(p.x + PW / 2 + (Math.random() - 0.5) * 20, p.y + PH, (Math.random() - 0.5) * 80, -Math.random() * 60, 0.4, '#e8dcc8', 3, 'dot', 300);
        } else if (!p.grounded && p.wallGrabOk && !p.inUpdraft) {
          const s = wallTouch(p);
          if (s) { p.anchored = true; p.wallSide = s; p.wallGrabOk = false; p.vx = 0; p.vy = 0; p.face = s; Sfx.play('grab'); }
        }
      }
    } else p.anchored = false;

    if (p.anchored) {
      p.vx = 0; p.vy = 0;
      if (p.wallSide && p.jumpBuf > 0) {
        p.anchored = false; p.vy = -380; p.vx = -p.wallSide * 230; p.jumpBuf = 0; p.wallSide = 0;
        Sfx.play('jump');
      } else {
        if (!p.wallSide && !hasGround(p)) p.anchored = false;
        else if (p.wallSide && !wallTouch(p)) p.anchored = false;
        if (p.anchored) return;
      }
    }

    // horizontal
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir) p.face = dir;
    const ice = p.grounded && p.groundChar === 'I';
    let acc = p.grounded ? (ice ? P.ACC_ICE : P.ACC_G) : P.ACC_A;
    if (!dir && ice) acc = 160;
    p.vx = approach(p.vx, dir * P.RUN, acc * dt);

    // vertical
    p.inUpdraft = inUpdraft(p);
    if (p.inUpdraft && !inp.anchor) {
      p.vy += (P.G - P.UPDRAFT) * dt;
      if (p.vy < -P.UPMAX) p.vy = -P.UPMAX;
      if (Math.random() < dt * 8) spawnParticle(p.x + Math.random() * PW, p.y + PH, 0, -120, 0.5, 'rgba(255,255,255,0.8)', 2, 'dot', 0);
    } else {
      p.vy += P.G * dt;
    }
    if (p.vy > P.MAXFALL) p.vy = P.MAXFALL;

    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -P.JUMP; p.coyote = 0; p.jumpBuf = 0; p.jumpCut = false; p.bounced = false; p.grounded = false;
      p.squash = -0.25; Sfx.play('jump');
      for (let i = 0; i < 4; i++) spawnParticle(p.x + PW / 2, p.y + PH, (Math.random() - 0.5) * 120, -Math.random() * 40, 0.35, 'rgba(255,255,255,0.8)', 3, 'dot', 200);
    }
    if (!inp.jump && p.vy < 0 && !p.jumpCut && !p.bounced && !p.inUpdraft) { p.vy *= 0.5; p.jumpCut = true; }

    let cdx = 0;
    if (p.grounded && (p.groundChar === '<' || p.groundChar === '>')) cdx = (p.groundChar === '>' ? 1 : -1) * P.CONVEY * dt;

    const wasGrounded = p.grounded, vyBefore = p.vy;
    moveX(p, p.vx * dt + cdx);
    p.grounded = false; p.gMover = null; p.onPartner = false; p.groundChar = null; p.groundTile = null;
    moveY(p, p.vy * dt);

    if (p.grounded) {
      p.coyote = P.COYOTE; p.wallGrabOk = true; p.bounced = false;
      if (!wasGrounded && vyBefore > 280) {
        p.squash = Math.min(0.35, vyBefore / 2400);
        Sfx.play('land');
        for (let i = 0; i < 5; i++) spawnParticle(p.x + PW / 2, p.y + PH, (Math.random() - 0.5) * 160, -Math.random() * 50, 0.35, 'rgba(255,255,255,0.75)', 3, 'dot', 200);
      }
      if (p.groundChar === 'B') {
        p.vy = -P.BOUNCE; p.grounded = false; p.bounced = true; p.coyote = 0; p.squash = -0.35;
        if (p.groundTile) G.bounceAnim.set(p.groundTile.ty * G.L.W + p.groundTile.tx, G.t);
        Sfx.play('bounce');
      }
    }
    if (p.grounded && Math.abs(p.vx) > 20) p.walkT += dt * Math.abs(p.vx) / 30;
  }

  // =====================================================================
  //  The red string
  // =====================================================================
  function ropeLength() { return clamp(ROPE_MAX - G.players.boy.reel - G.players.girl.reel, ROPE_MIN, ROPE_MAX); }
  function solveRope() {
    const a = G.players.boy, b = G.players.girl;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), L = ropeLength();
    G.ropeTension = clamp((d - L * 0.92) / (L * 0.08), 0, 1);
    if (d > ROPE_MAX * 4 || d < 0.001) return;
    // a dangling partner's weight drags an unanchored, standing player toward the edge
    if (d > L - 12) {
      const drag = (p, o, dirx) => {
        if (!p.local || p.anchored || !p.grounded || o.grounded || o.anchored) return;
        if (o.y + o.h / 2 < p.y + p.h / 2 + 8) return;
        moveX(p, Math.sign(dirx) * (p.groundChar === 'I' ? 150 : 75) * DT);
      };
      drag(a, b, dx); drag(b, a, -dx);
    }
    if (d <= L) return;
    const nx = dx / d, ny = dy / d, ex = d - L;
    const wa = a.anchored ? 0 : 1, wb = b.anchored ? 0 : 1;
    if (wa + wb === 0) return;
    const sa = wa / (wa + wb), sb = wb / (wa + wb);
    if (a.local && sa > 0) { pull(a, nx, ny, ex * sa); if (b.anchored && ay >= by - 8) a.ropeHang = 0.15; }
    if (b.local && sb > 0) { pull(b, -nx, -ny, ex * sb); if (a.anchored && by >= ay - 8) b.ropeHang = 0.15; }
  }
  function pull(p, nx, ny, amt) {
    // per-axis caps: if a wall blocks the sideways part, the vertical part still applies fully
    moveX(p, clamp(nx * amt, -40, 40));
    moveY(p, clamp(ny * amt, -40, 40));
    depenetrate(p);
    if (ny < -0.05 && p.vy > 0) p.vy *= 0.5;
    const vd = p.vx * nx + p.vy * ny;
    if (vd < 0) { p.vx -= vd * nx; p.vy -= vd * ny; }
  }

  function hand(p) { return { x: p.x + p.w / 2 + p.face * 7, y: p.y + p.h - 13 }; }
  function initRope() {
    const a = hand(G.players.boy), b = hand(G.players.girl);
    G.rope = [];
    for (let i = 0; i < ROPE_N; i++) {
      const f = i / (ROPE_N - 1), x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      G.rope.push({ x, y, px: x, py: y });
    }
  }
  function updateRopeVisual(dt) {
    const R = G.rope; if (!R.length) return;
    const a = hand(G.players.boy), b = hand(G.players.girl);
    const seg = ropeLength() / (ROPE_N - 1) * 0.98;
    for (let i = 1; i < ROPE_N - 1; i++) {
      const p = R[i];
      const vx = (p.x - p.px) * 0.985, vy = (p.y - p.py) * 0.985;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + 900 * dt * dt;
    }
    for (let it = 0; it < 14; it++) {
      R[0].x = a.x; R[0].y = a.y; R[ROPE_N - 1].x = b.x; R[ROPE_N - 1].y = b.y;
      for (let i = 0; i < ROPE_N - 1; i++) {
        const p1 = R[i], p2 = R[i + 1];
        const dx = p2.x - p1.x, dy = p2.y - p1.y, d = Math.hypot(dx, dy);
        if (d <= seg || d === 0) continue;
        const diff = (d - seg) / d;
        const w1 = i === 0 ? 0 : 0.5, w2 = i + 1 === ROPE_N - 1 ? 0 : 0.5;
        const s = w1 + w2 || 1;
        p1.x += dx * diff * (w1 / s); p1.y += dy * diff * (w1 / s);
        p2.x -= dx * diff * (w2 / s); p2.y -= dy * diff * (w2 / s);
      }
      if (it % 4 === 3) for (let i = 1; i < ROPE_N - 1; i++) {
        const p = R[i], tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
        if (solidAt(tx, ty, null)) {
          const l = p.x - tx * T, r = (tx + 1) * T - p.x, u = p.y - ty * T, d2 = (ty + 1) * T - p.y;
          const m = Math.min(l, r, u, d2);
          if (m === u) { p.y = ty * T - 0.5; p.py = p.y; } else if (m === l) p.x = tx * T - 0.5; else if (m === r) p.x = (tx + 1) * T + 0.5; else p.y = (ty + 1) * T + 0.5;
        }
      }
    }
    R[0].x = a.x; R[0].y = a.y; R[ROPE_N - 1].x = b.x; R[ROPE_N - 1].y = b.y;
  }

  // =====================================================================
  //  Hazards, pickups, goal
  // =====================================================================
  function rectHit(p, x, y, w, h) {
    return p.x + 3 < x + w && p.x + p.w - 3 > x && p.y + 3 < y + h && p.y + p.h - 1 > y;
  }
  function checkHazards(p) {
    const L = G.L;
    if (p.y > L.H * T + 40) return true;
    const x0 = Math.floor(p.x / T), x1 = Math.floor((p.x + p.w) / T), y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + p.h) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const c = tileAt(tx, ty);
      if (c === '^' && rectHit(p, tx * T + 4, ty * T + 15, T - 8, T - 15)) return true;
      if (c === 'v' && rectHit(p, tx * T + 4, ty * T, T - 8, T - 17)) return true;
      if (c === '~' && rectHit(p, tx * T, ty * T + 12, T, T - 12)) return true;
    }
    for (const s of L.saws) {
      const cx = clamp(s.x, p.x + 2, p.x + p.w - 2), cy = clamp(s.y, p.y + 2, p.y + p.h - 1);
      if (Math.hypot(s.x - cx, s.y - cy) < s.r) return true;
    }
    return false;
  }
  function checkPickups(p) {
    const L = G.L, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    L.hearts.forEach((h, i) => { if (!h.taken && Math.hypot(h.x - cx, h.y - cy) < 24) collectHeart(i, true); });
    L.checkpoints.forEach((c, i) => { if (i > G.cp && Math.abs(c.x - cx) < 26 && cy > c.y - 70 && cy < c.y + 4) activateCp(i, true); });
  }
  function collectHeart(i, send) {
    const h = G.L.hearts[i]; if (!h || h.taken) return;
    h.taken = true; Sfx.play('heart');
    for (let k = 0; k < 14; k++) spawnParticle(h.x, h.y, (Math.random() - 0.5) * 260, (Math.random() - 0.5) * 260, 0.9, k % 2 ? '#ff5d8f' : '#ffd1dc', 4 + Math.random() * 4, k % 3 ? 'star' : 'heart', 100);
    if (send) netSend({ t: 'heart', i });
  }
  function activateCp(i, send) {
    if (i <= G.cp) return;
    G.cp = i; Sfx.play('cp');
    const c = G.L.checkpoints[i];
    for (let k = 0; k < 10; k++) spawnParticle(c.x, c.y - 50, (Math.random() - 0.5) * 200, -Math.random() * 200, 0.8, '#ff8fb1', 4, 'heart', 300);
    if (send) netSend({ t: 'cp', i });
  }
  function checkGoal() {
    if (G.state !== 'play' || G.respawnT > 0) return;
    if (G.mode === 'online' && G.net && G.net.role !== 'host') return;
    const r = G.L.goal.rect;
    const inside = (p) => { const cx = p.x + p.w / 2, cy = p.y + p.h / 2; return cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h; };
    if (inside(G.players.boy) && inside(G.players.girl)) win(false);
  }
  function win(fromNet) {
    if (G.state !== 'play') return;
    G.state = 'won'; G.winT = 0;
    if (!fromNet) netSend({ t: 'win', time: G.time });
    Sfx.play('win');
    const g = G.L.goal;
    for (let i = 0; i < 40; i++) spawnParticle(g.x, g.y - 60, (Math.random() - 0.5) * 500, -Math.random() * 400, 1.6, ['#ff5d8f', '#ffd1dc', '#ffcc33', '#8fd0ff'][i % 4], 4 + Math.random() * 6, i % 2 ? 'heart' : 'star', 400);
    const res = { n: G.L.n, hearts: G.L.hearts.filter(h => h.taken).length, total: G.L.hearts.length, time: G.time, deaths: G.deaths };
    setTimeout(() => { if (G.hooks.win) G.hooks.win(res); }, 1600);
  }

  // ---------- kiss ----------
  function kissMid() {
    const a = G.players.boy, b = G.players.girl;
    return { x: (a.x + b.x) / 2 + PW / 2, y: Math.min(a.y, b.y) };
  }
  function canKiss() {
    if (!G.players || G.state !== 'play' || G.respawnT > 0 || G.kissT > 0) return false;
    const a = G.players.boy, b = G.players.girl;
    return Math.abs(a.x - b.x) < 34 && Math.abs(a.y - b.y) < 20 && !a.anchored && !b.anchored;
  }
  function tryKiss() { if (canKiss()) startKiss(true); }
  function startKiss(send) {
    if (!G.players || G.kissT > 0) return;
    const a = G.players.boy, b = G.players.girl;
    G.kissT = 1.4;
    a.face = b.x >= a.x ? 1 : -1; b.face = -a.face;
    const m = kissMid();
    const cols = ['#ff3d73', '#ff7aa8', '#ffb3c7', '#ff5d8f', '#ffd1dc'];
    for (let i = 0; i < 46; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 120 + Math.random() * 260;
      spawnParticle(m.x, m.y - 4, Math.cos(ang) * sp, Math.sin(ang) * sp, 1.6 + Math.random() * 1.2, cols[i % cols.length], 4 + Math.random() * 7, 'heart', 120);
    }
    Sfx.play('kiss');
    if (send) netSend({ t: 'kiss' });
  }

  function doEmote(ch, k, send) {
    const p = G.players && G.players[ch]; if (!p) return;
    p.emote = EMOTES[k] || EMOTES[0]; p.emoteT = 2.2; Sfx.play('pop');
    if (k === 0) for (let i = 0; i < 5; i++) spawnParticle(p.x + PW / 2, p.y, (Math.random() - 0.5) * 80, -80 - Math.random() * 80, 1, '#ff5d8f', 6, 'heart', -50);
    if (send && G.mode === 'online') netSend({ t: 'emote', k });
  }

  // =====================================================================
  //  Network glue
  // =====================================================================
  function netSend(m) { if (G.mode === 'online' && G.net) G.net.send(m); }
  function netTick(dt) {
    if (G.mode !== 'online' || !G.players) return;
    G.netAcc += dt;
    if (G.netAcc < 1 / 30) return;
    G.netAcc = 0;
    const p = G.players[G.myChar];
    netSend({ t: 's', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, vx: Math.round(p.vx), vy: Math.round(p.vy), f: p.face, a: p.anchored ? 1 : 0, w: p.wallSide, g: p.grounded ? 1 : 0, r: Math.round(p.reel), tt: G.t, lv: G.L.n });
  }
  function onNet(m) {
    if (!G.players || !G.L) return;
    const o = G.players[other(G.myChar)];
    switch (m.t) {
      case 's':
        if (m.lv !== G.L.n) return;
        if (G.respawnT > 0.3) return;
        o.tx = m.x; o.ty = m.y; o.nvx = m.vx; o.nvy = m.vy; o.face = m.f; o.anchored = !!m.a; o.wallSide = m.w || 0;
        if (m.g && !o.grounded && o.nvy >= 0) o.squash = 0.15;
        o.grounded = !!m.g; o.reel = m.r || 0; o.netAge = 0;
        if (G.net && G.net.role === 'guest' && typeof m.tt === 'number') {
          const diff = m.tt + 0.04 - G.t;
          if (Math.abs(diff) > 0.5) G.t += diff; else G.t += diff * 0.08;
        }
        break;
      case 'die': startRespawn(false); break;
      case 'heart': collectHeart(m.i, false); break;
      case 'cp': activateCp(m.i, false); break;
      case 'latch': latch(m.g, false); break;
      case 'emote': doEmote(other(G.myChar), m.k, false); break;
      case 'kiss': startKiss(false); break;
      case 'win': if (typeof m.time === 'number') G.time = m.time; win(true); break;
    }
  }

  // =====================================================================
  //  Particles & ambience
  // =====================================================================
  function spawnParticle(x, y, vx, vy, life, color, size, type, g) {
    if (G.particles.length > 500) return;
    G.particles.push({ x, y, vx, vy, life, max: life, color, size, type, g: g || 0, rot: Math.random() * 6 });
  }
  function updateParticles(dt) {
    const ps = G.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.99; p.rot += dt * 3;
    }
    // ambient sparkles near lava / hearts
    const L = G.L;
    if (Math.random() < dt * 3) {
      const h = L.hearts[Math.floor(Math.random() * L.hearts.length)];
      if (h && !h.taken) spawnParticle(h.x + (Math.random() - 0.5) * 20, h.y + (Math.random() - 0.5) * 20, 0, -20, 0.8, '#fff', 2, 'star', 0);
    }
    // love particles when the two stand close together
    const a = G.players.boy, b = G.players.girl;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 40 && Math.random() < dt * 1.5) spawnParticle((a.x + b.x) / 2 + PW / 2, Math.min(a.y, b.y) - 6, (Math.random() - 0.5) * 30, -50, 1.2, '#ff7aa8', 6, 'heart', -20);
  }

  function initAmbient() {
    G.ambient = [];
    const type = G.L ? G.L.theme.particle : 'petal';
    const n = type === 'star' ? 70 : type === 'snow' ? 90 : 40;
    for (let i = 0; i < n; i++) G.ambient.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), ph: Math.random() * 6.28, sp: 0.5 + Math.random() });
  }

  // =====================================================================
  //  Rendering helpers
  // =====================================================================
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function heartPath(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + 0.45 * s);
    ctx.bezierCurveTo(x - 0.62 * s, y + 0.02 * s, x - 0.52 * s, y - 0.5 * s, x, y - 0.18 * s);
    ctx.bezierCurveTo(x + 0.52 * s, y - 0.5 * s, x + 0.62 * s, y + 0.02 * s, x, y + 0.45 * s);
    ctx.closePath();
  }
  function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); }

  function resize() {
    if (!G.canvas) return;
    const dpr = Math.min(2, global.devicePixelRatio || 1);
    const w = Math.floor(global.innerWidth * dpr), h = Math.floor(global.innerHeight * dpr);
    if (w !== G.cw || h !== G.ch || dpr !== G.dpr) {
      G.cw = w; G.ch = h; G.dpr = dpr;
      G.canvas.width = w; G.canvas.height = h;
      if (G.dark) { G.dark.width = w; G.dark.height = h; }
    }
    const zRaw = Math.max(h / (VIEW_TILES_H * T), w / (32 * T));
    G.zoom = Math.max(1, Math.round(zRaw * T)) / T;
  }

  // ---------- tile sprites (cached at the current zoom) ----------
  function sprite(key, draw) {
    const k = G.zoom + '|' + G.L.themeKey;
    if (k !== G.sprKey) { G.spr.clear(); G.sprKey = k; }
    let c = G.spr.get(key);
    if (!c) {
      const s = Math.round(T * G.zoom);
      c = document.createElement('canvas'); c.width = c.height = s;
      const x = c.getContext('2d'); x.scale(s / T, s / T);
      draw(x);
      G.spr.set(key, c);
    }
    return c;
  }

  function drawGround(x, v, m) {
    const th = G.L.theme;
    x.fillStyle = th.ground; x.fillRect(0, 0, T, T);
    const r = HS.mulberry(v * 977 + 13);
    if (th.style === 'brick') {
      x.strokeStyle = th.groundDark; x.lineWidth = 1.5; x.globalAlpha = 0.6;
      for (let row = 0; row < 4; row++) {
        x.beginPath(); x.moveTo(0, row * 8 + 0.5); x.lineTo(T, row * 8 + 0.5); x.stroke();
        const off = row % 2 ? 8 : 0;
        for (let c = off; c < T; c += 16) { x.beginPath(); x.moveTo(c + 0.5, row * 8); x.lineTo(c + 0.5, row * 8 + 8); x.stroke(); }
      }
      x.globalAlpha = 1;
    } else {
      x.fillStyle = th.groundDark;
      for (let i = 0; i < 4; i++) {
        x.globalAlpha = 0.25 + r() * 0.25;
        x.beginPath(); x.ellipse(3 + r() * 26, 6 + r() * 24, 1.5 + r() * 3, 1 + r() * 2.2, 0, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
      if (th.style === 'rock' && v === 0) {
        x.strokeStyle = '#ff6a2a'; x.globalAlpha = 0.3; x.lineWidth = 1.2;
        x.beginPath(); x.moveTo(r() * 32, 10 + r() * 20); x.lineTo(r() * 32, 10 + r() * 20); x.lineTo(r() * 32, 10 + r() * 20); x.stroke(); x.globalAlpha = 1;
      }
    }
    x.fillStyle = th.groundDark;
    if (m & 8) x.fillRect(0, 0, 3, T);
    if (m & 2) x.fillRect(T - 3, 0, 3, T);
    if (m & 4) x.fillRect(0, T - 3, T, 3);
    if (m & 1) {
      x.fillStyle = th.top;
      const deep = th.style === 'snow' || th.style === 'cloud' ? 11 : 8;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(T, 0); x.lineTo(T, deep - 2);
      for (let i = 4; i >= 0; i--) { const px = i * 8; x.quadraticCurveTo(px + 4, deep + 3 + (i % 2) * 1.5, px, deep - 2 + ((i + v) % 2) * 2); }
      x.closePath(); x.fill();
      x.fillStyle = th.topLight; x.globalAlpha = 0.7; x.fillRect(0, 0, T, 2.5); x.globalAlpha = 1;
      if (th.style === 'crystal') {
        x.fillStyle = th.topLight;
        for (let i = 0; i < 2; i++) { const px = 4 + r() * 24; x.beginPath(); x.moveTo(px, 7); x.lineTo(px + 2.5, 2); x.lineTo(px + 5, 7); x.fill(); }
      }
    }
    x.globalCompositeOperation = 'destination-out';
    const cut = (cx, cy, dx, dy) => { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + dx * 6, cy); x.quadraticCurveTo(cx, cy, cx, cy + dy * 6); x.closePath(); x.fill(); };
    if ((m & 1) && (m & 8)) cut(0, 0, 1, 1);
    if ((m & 1) && (m & 2)) cut(T, 0, -1, 1);
    if ((m & 4) && (m & 8)) cut(0, T, 1, -1);
    if ((m & 4) && (m & 2)) cut(T, T, -1, -1);
    x.globalCompositeOperation = 'source-over';
  }
  function drawIce(x, m) {
    const g = x.createLinearGradient(0, 0, 0, T); g.addColorStop(0, '#e9f8ff'); g.addColorStop(1, '#9fd6f2');
    x.fillStyle = g; x.fillRect(0, 0, T, T);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(6, 24); x.lineTo(14, 8); x.moveTo(16, 26); x.lineTo(21, 16); x.stroke();
    x.fillStyle = '#7cc0e4';
    if (m & 8) x.fillRect(0, 0, 2, T);
    if (m & 2) x.fillRect(T - 2, 0, 2, T);
    if (m & 4) x.fillRect(0, T - 2, T, 2);
    if (m & 1) { x.fillStyle = '#ffffff'; x.fillRect(0, 0, T, 3); }
  }
  function drawSpikes(x, up) {
    x.save();
    if (!up) { x.translate(0, T); x.scale(1, -1); }
    for (let i = 0; i < 3; i++) {
      const bx = 2 + i * 9.4;
      x.fillStyle = '#c8cfdc';
      x.beginPath(); x.moveTo(bx, T); x.lineTo(bx + 4.7, 13); x.lineTo(bx + 9.4, T); x.closePath(); x.fill();
      x.fillStyle = '#eef2f8';
      x.beginPath(); x.moveTo(bx + 4.7, 13); x.lineTo(bx + 6, T); x.lineTo(bx + 4.7, T); x.closePath(); x.fill();
      x.fillStyle = '#ff5d6c'; x.beginPath(); x.arc(bx + 4.7, 14.5, 1.3, 0, 7); x.fill();
    }
    x.fillStyle = '#7d8696'; x.fillRect(0, T - 3, T, 3);
    x.restore();
  }
  function drawPlank(x) {
    const th = G.L.theme;
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(1, 9, T - 2, 3);
    x.fillStyle = th.plank; rr(x, 0, 0, T, 10, 3); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(2, 1.5, T - 4, 2);
    x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.arc(5, 6, 1.3, 0, 7); x.arc(T - 5, 6, 1.3, 0, 7); x.fill();
  }

  function groundMask(tx, ty, set) {
    const solid = (c) => set.includes(c);
    let m = 0;
    if (!solid(tileAt(tx, ty - 1)) && ty - 1 >= 0) m |= 1;
    if (ty - 1 < 0) m |= 0;
    if (tx + 1 < G.L.W && !solid(tileAt(tx + 1, ty))) m |= 2;
    if (ty + 1 < G.L.H && !solid(tileAt(tx, ty + 1))) m |= 4;
    if (tx - 1 >= 0 && !solid(tileAt(tx - 1, ty))) m |= 8;
    return m;
  }

  // =====================================================================
  //  Background
  // =====================================================================
  function layerNoise(x, s) {
    return Math.sin(x * 0.0041 + s) * 0.5 + Math.sin(x * 0.0113 + s * 2.1) * 0.3 + Math.sin(x * 0.027 + s * 3.7) * 0.2;
  }
  function drawBackground(ctx, th, camx, camy, maxCamY) {
    const W = G.cw, H = G.ch, z = G.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const t = G.t || G.menuT;
    if (th.particle === 'star' || th.cave) {
      for (let i = 0; i < 60; i++) {
        const sx = ((hash(i, 7) % 1000) / 1000 * W - camx * z * 0.02 + W * 10) % W, sy = (hash(i, 9) % 1000) / 1000 * H * 0.7;
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + i);
        ctx.fillStyle = th.cave ? '#b9a8ff' : '#ffffff';
        ctx.fillRect(sx, sy, 2 * G.dpr, 2 * G.dpr);
      }
      ctx.globalAlpha = 1;
    }
    if (th.sun) {
      const sx = W * 0.78 - camx * z * 0.01, sy = H * 0.2;
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 160 * G.dpr);
      sg.addColorStop(0, th.sun); sg.addColorStop(0.25, th.sun); sg.addColorStop(0.27, 'rgba(255,255,255,0.35)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, 160 * G.dpr, 0, 7); ctx.fill();
    }
    if (th.moon) {
      const sx = W * 0.8, sy = H * 0.18, r = 34 * G.dpr;
      const mg = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 4);
      mg.addColorStop(0, 'rgba(255,250,220,0.35)'); mg.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(sx, sy, r * 4, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff8dc'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#e9dfb8'; ctx.beginPath(); ctx.arc(sx - r * 0.3, sy - r * 0.2, r * 0.18, 0, 7); ctx.arc(sx + r * 0.25, sy + r * 0.3, r * 0.12, 0, 7); ctx.fill();
    }
    const vyOff = (maxCamY - camy) * z;
    const layer = (color, par, base, amp, seed, inverted) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      const step = 6 * G.dpr;
      if (inverted) {
        ctx.moveTo(0, 0);
        for (let sx = 0; sx <= W + step; sx += step) {
          const wx = sx / z + camx * par;
          ctx.lineTo(sx, base + vyOff * par * 0.5 - amp * (layerNoise(wx, seed) + 1) * 0.5);
        }
        ctx.lineTo(W, 0);
      } else {
        ctx.moveTo(0, H);
        for (let sx = 0; sx <= W + step; sx += step) {
          const wx = sx / z + camx * par;
          ctx.lineTo(sx, base + vyOff * par * 0.6 - amp * (layerNoise(wx, seed) + 1) * 0.5);
        }
        ctx.lineTo(W, H);
      }
      ctx.closePath(); ctx.fill();
    };
    if (th.cave) {
      layer(th.far, 0.15, H * 0.3, -H * 0.25, 1.3, true);
      layer(th.far, 0.15, H * 0.7, H * 0.3, 2.1, false);
      layer(th.mid, 0.35, H * 0.18, -H * 0.2, 4.2, true);
      layer(th.mid, 0.35, H * 0.85, H * 0.3, 5.7, false);
    } else {
      layer(th.far, 0.15, H * 0.66, H * 0.42, 1.7, false);
      if (th.style === 'cloud') {
        ctx.globalAlpha = 0.6;
      }
      layer(th.mid, 0.35, H * 0.86, H * 0.3, 4.4, false);
      ctx.globalAlpha = 1;
    }
    if (!th.cave && th.particle !== 'star' && th.particle !== 'ember') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 6; i++) {
        const span = W + 400 * G.dpr;
        const cx = ((hash(i, 3) % 1000) / 1000 * span - camx * z * 0.08 + t * 12 * G.dpr * (0.5 + (i % 3) * 0.3)) % span;
        const x = (cx + span) % span - 200 * G.dpr, y = H * (0.08 + (hash(i, 5) % 100) / 100 * 0.3);
        const s = (0.6 + (i % 3) * 0.3) * G.dpr * 1.4;
        ctx.beginPath(); ctx.ellipse(x, y, 50 * s, 16 * s, 0, 0, 7); ctx.ellipse(x - 26 * s, y + 4 * s, 28 * s, 12 * s, 0, 0, 7); ctx.ellipse(x + 22 * s, y - 6 * s, 30 * s, 16 * s, 0, 0, 7); ctx.fill();
      }
    }
  }

  function drawAmbient(ctx, type, dt) {
    const W = G.cw, H = G.ch, t = G.t || G.menuT, d = G.dpr;
    for (const a of G.ambient) {
      let x, y;
      switch (type) {
        case 'snow':
          a.y += dt * 0.05 * a.sp; a.x += Math.sin(t + a.ph) * dt * 0.01;
          x = a.x * W; y = a.y * H;
          ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(x, y, 2.2 * a.s * d, 0, 7); ctx.fill(); break;
        case 'ember':
          a.y -= dt * 0.04 * a.sp; a.x += Math.sin(t * 2 + a.ph) * dt * 0.01;
          x = a.x * W; y = a.y * H;
          ctx.fillStyle = `rgba(255,${120 + Math.floor(a.s * 60)},40,${0.5 + 0.4 * Math.sin(t * 5 + a.ph)})`; ctx.fillRect(x, y, 2.5 * d * a.s, 2.5 * d * a.s); break;
        case 'star':
          x = a.x * W; y = a.y * H * 0.8;
          ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * a.sp + a.ph));
          ctx.fillStyle = '#fff'; ctx.fillRect(x, y, 1.6 * d * a.s, 1.6 * d * a.s); ctx.globalAlpha = 1; break;
        case 'firefly':
          a.x += Math.sin(t * 0.7 + a.ph) * dt * 0.01; a.y += Math.cos(t * 0.5 + a.ph) * dt * 0.01;
          x = a.x * W; y = (0.3 + a.y * 0.7) * H;
          ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + a.ph));
          ctx.fillStyle = '#fff6a0'; ctx.beginPath(); ctx.arc(x, y, 2.4 * d, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,246,160,0.25)'; ctx.beginPath(); ctx.arc(x, y, 7 * d, 0, 7); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'sparkle':
          x = a.x * W; y = a.y * H;
          ctx.globalAlpha = Math.max(0, Math.sin(t * a.sp * 1.5 + a.ph));
          ctx.fillStyle = '#d9ccff'; ctx.fillRect(x - d, y - 3 * d, 2 * d, 6 * d); ctx.fillRect(x - 3 * d, y - d, 6 * d, 2 * d); ctx.globalAlpha = 1; break;
        case 'heart':
          a.y -= dt * 0.03 * a.sp; a.x += Math.sin(t + a.ph) * dt * 0.01;
          x = a.x * W; y = a.y * H;
          ctx.globalAlpha = 0.45; ctx.fillStyle = '#ff7aa8'; heartPath(ctx, x, y, 9 * d * a.s); ctx.fill(); ctx.globalAlpha = 1; break;
        case 'dust': case 'leaf': case 'feather': case 'petal':
        default:
          a.x += dt * 0.03 * a.sp; a.y += dt * 0.02 * a.sp + Math.sin(t + a.ph) * dt * 0.01;
          x = a.x * W; y = a.y * H;
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * a.sp + a.ph);
          ctx.fillStyle = type === 'petal' ? 'rgba(255,170,200,0.85)' : type === 'leaf' ? 'rgba(140,170,90,0.8)' : type === 'feather' ? 'rgba(255,255,255,0.9)' : 'rgba(255,220,170,0.5)';
          ctx.beginPath(); ctx.ellipse(0, 0, 4 * d * a.s, 2 * d * a.s, 0, 0, 7); ctx.fill(); ctx.restore();
      }
      if (a.y > 1.05) { a.y = -0.05; a.x = Math.random(); }
      if (a.y < -0.05) { a.y = 1.05; a.x = Math.random(); }
      if (a.x > 1.05) a.x = -0.05;
      if (a.x < -0.05) a.x = 1.05;
    }
  }

  // =====================================================================
  //  Characters
  // =====================================================================
  function drawCharacter(ctx, p, t) {
    const C = LOOK[p.char], girl = p.char === 'girl';
    const moving = p.grounded && Math.abs(p.vx) > 20 && !p.anchored;
    const wt = p.walkT;
    const air = !p.grounded && !p.anchored;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    if (p.anchored && p.wallSide) ctx.rotate(p.wallSide * 0.12);
    const kissing = G.kissT > 0 && G.players && G.players[p.char] === p;
    if (kissing) ctx.rotate(p.face * 0.22 * Math.min(1, G.kissT * 3, (1.4 - G.kissT) * 6));
    const sq = p.squash;
    ctx.scale(p.face * (1 + sq * 0.6), 1 - sq * 0.6);
    const crouch = p.anchored && !p.wallSide ? 3 : 0;
    const bob = moving ? Math.abs(Math.sin(wt)) * -1.5 : Math.sin(t * 2.2 + (girl ? 1 : 0)) * 0.4;

    // anchor glow
    if (p.anchored) {
      ctx.fillStyle = 'rgba(255,214,102,0.35)';
      ctx.beginPath(); ctx.ellipse(0, -1, 14, 4, 0, 0, 7); ctx.fill();
    }
    // legs
    ctx.fillStyle = C.shoe;
    const la = moving ? Math.sin(wt) * 4 : 0;
    if (air) { rr(ctx, -6, -9, 5, 6, 2); ctx.fill(); rr(ctx, 1, -7, 5, 6, 2); ctx.fill(); }
    else if (crouch) { rr(ctx, -9, -5, 6, 5, 2); ctx.fill(); rr(ctx, 3, -5, 6, 5, 2); ctx.fill(); }
    else { rr(ctx, -6 + la * 0.6, -6 - Math.max(0, la) * 0.3, 5, 6, 2); ctx.fill(); rr(ctx, 1 - la * 0.6, -6 - Math.max(0, -la) * 0.3, 5, 6, 2); ctx.fill(); }

    ctx.translate(0, crouch + bob);
    // back hair (girl)
    if (girl) {
      ctx.fillStyle = C.hair;
      rr(ctx, -12, -36, 20, 22, 8); ctx.fill();
      const sw = Math.sin(t * 3) * 1.5 - (air ? 2 : 0) - (moving ? 1.5 : 0);
      ctx.beginPath(); ctx.moveTo(-11, -30); ctx.quadraticCurveTo(-17 + sw, -22, -12 + sw, -12); ctx.lineTo(-6, -16); ctx.closePath(); ctx.fill();
    }
    // body
    ctx.fillStyle = C.body;
    if (girl) {
      ctx.beginPath(); ctx.moveTo(-6, -19); ctx.lineTo(6, -19); ctx.quadraticCurveTo(9, -10, 10, -5); ctx.lineTo(-10, -5); ctx.quadraticCurveTo(-9, -10, -6, -19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.bodyDark; ctx.fillRect(-10, -7, 20, 2);
      // the letter "i" on her dress (un-flipped so it always reads correctly)
      ctx.save(); ctx.scale(p.face, 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -15.6, 1.25, 0, 7); ctx.fill();
      rr(ctx, -1.05, -13.6, 2.1, 5.2, 1); ctx.fill();
      ctx.restore();
    } else {
      rr(ctx, -7, -19, 14, 14, 4); ctx.fill();
      ctx.fillStyle = C.bodyDark; ctx.fillRect(-7, -9, 14, 3);
    }
    // scarf (red, matches the string)
    ctx.fillStyle = '#e8344e';
    rr(ctx, -7, -21, 14, 4.5, 2); ctx.fill();
    const flap = Math.sin(t * 8 + (girl ? 2 : 0)) * 2 + (moving || air ? 2 : 0);
    ctx.beginPath(); ctx.moveTo(-5, -19); ctx.quadraticCurveTo(-11, -17 + flap * 0.3, -14 - flap, -14 + flap * 0.5); ctx.lineTo(-11 - flap * 0.5, -12); ctx.quadraticCurveTo(-8, -15, -3, -17); ctx.closePath(); ctx.fill();
    // arms
    ctx.fillStyle = C.skin;
    if (p.anchored && p.wallSide) { ctx.beginPath(); ctx.arc(9, -22, 2.8, 0, 7); ctx.arc(9, -14, 2.8, 0, 7); ctx.fill(); }
    else if (p.anchored) { ctx.beginPath(); ctx.arc(-8, -8, 2.8, 0, 7); ctx.arc(8, -8, 2.8, 0, 7); ctx.fill(); }
    else if (air) { ctx.beginPath(); ctx.arc(-9, -21, 2.8, 0, 7); ctx.arc(9, -20, 2.8, 0, 7); ctx.fill(); }
    else { const as = moving ? Math.sin(wt + Math.PI) * 2 : 0; ctx.beginPath(); ctx.arc(-8.5, -12 + as, 2.8, 0, 7); ctx.arc(8.5, -12 - as, 2.8, 0, 7); ctx.fill(); }
    // head
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.arc(0, -30, 10.5, 0, 7); ctx.fill();
    // hair
    ctx.fillStyle = C.hair;
    if (girl) {
      ctx.beginPath(); ctx.arc(0, -31, 11.2, Math.PI * 0.98, Math.PI * 2.02); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-11, -32); ctx.quadraticCurveTo(-2, -28, 4, -34); ctx.quadraticCurveTo(8, -29, 11, -31); ctx.lineTo(10, -37); ctx.lineTo(-10, -37); ctx.closePath(); ctx.fill();
      // bow
      ctx.fillStyle = C.bow;
      ctx.save(); ctx.translate(-5, -41); ctx.rotate(-0.3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -4); ctx.lineTo(7, 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill(); ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(0, -31, 11.2, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-11, -31); ctx.lineTo(-8, -27); ctx.lineTo(-5, -31); ctx.lineTo(-1, -28); ctx.lineTo(3, -32); ctx.lineTo(7, -29); ctx.lineTo(11, -32); ctx.lineTo(11, -36); ctx.lineTo(-11, -36); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, -41); ctx.quadraticCurveTo(2, -46, 6, -43); ctx.quadraticCurveTo(3, -42, 2, -40); ctx.closePath(); ctx.fill();
    }
    // face
    const blink = p.blinkT < 0 || kissing;
    ctx.fillStyle = '#2b2140';
    const eh = blink ? 0.4 : 2.3;
    ctx.beginPath(); ctx.ellipse(1.5, -28.5, 1.6, eh, 0, 0, 7); ctx.ellipse(7, -28.5, 1.6, eh, 0, 0, 7); ctx.fill();
    if (!blink) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2, -29.5, 0.6, 0, 7); ctx.arc(7.5, -29.5, 0.6, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,120,140,0.45)';
    ctx.beginPath(); ctx.ellipse(-2, -25, 2.2, 1.4, 0, 0, 7); ctx.ellipse(9.5, -25, 2, 1.4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a3a3a'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath();
    if (p.vy > 400 && air) ctx.arc(4.5, -24, 1.5, 0, 7); else ctx.arc(4.5, -25, 1.8, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (girl) { ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(8.5, -31); ctx.lineTo(9.8, -32); ctx.moveTo(3, -31); ctx.lineTo(1.6, -32); ctx.stroke(); }
    ctx.restore();
  }

  // =====================================================================
  //  World entities
  // =====================================================================
  function drawDecor(ctx, d, t) {
    const x = d.x, y = d.y;
    ctx.save();
    switch (d.type) {
      case 'flower': {
        ctx.strokeStyle = '#4f9d3f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.sin(t * 2 + d.v * 9) * 1.5, y - 10); ctx.stroke();
        const col = ['#ff7aa8', '#ffd44f', '#ffffff', '#c39bff'][Math.floor(d.v * 4)];
        ctx.fillStyle = col; const fx = x + Math.sin(t * 2 + d.v * 9) * 1.5, fy = y - 11;
        for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 2.6, fy + Math.sin(a) * 2.6, 2.1, 0, 7); ctx.fill(); }
        ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, 7); ctx.fill(); break;
      }
      case 'heartflower': case 'glowflower': {
        ctx.strokeStyle = d.type === 'glowflower' ? '#4d8f78' : '#7a9c6a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 10); ctx.stroke();
        if (d.type === 'glowflower') { ctx.fillStyle = 'rgba(140,255,220,0.25)'; ctx.beginPath(); ctx.arc(x, y - 12, 8 + Math.sin(t * 2 + d.v * 10), 0, 7); ctx.fill(); ctx.fillStyle = '#9fffe0'; ctx.beginPath(); ctx.arc(x, y - 12, 3, 0, 7); ctx.fill(); }
        else { ctx.fillStyle = '#ff5d8f'; heartPath(ctx, x, y - 12, 9); ctx.fill(); }
        break;
      }
      case 'tuft': case 'tuft2': {
        ctx.strokeStyle = d.type === 'tuft2' ? 'rgba(255,255,255,0.9)' : G.L.theme.topLight; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
        const s = Math.sin(t * 1.8 + d.v * 7) * 1.2;
        ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 5 + s, y - 6); ctx.moveTo(x, y); ctx.lineTo(x + s, y - 8); ctx.moveTo(x + 3, y); ctx.lineTo(x + 5 + s, y - 6); ctx.stroke(); break;
      }
      case 'mushroom':
        ctx.fillStyle = '#f3e3cf'; ctx.fillRect(x - 1.5, y - 6, 3, 6);
        ctx.fillStyle = d.v > 0.5 ? '#e94b4b' : '#b06bd6'; ctx.beginPath(); ctx.arc(x, y - 6, 5, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 2, y - 8, 1, 0, 7); ctx.arc(x + 2, y - 7.5, 0.9, 0, 7); ctx.fill(); break;
      case 'fern':
        ctx.strokeStyle = '#2f8a45'; ctx.lineWidth = 1.5;
        for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + i * 6, y - 8, x + i * 9, y - 6); ctx.stroke(); } break;
      case 'crystal': {
        const col = d.v > 0.5 ? '#c9b6ff' : '#8fe3ff';
        ctx.fillStyle = col; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 2, y - 11); ctx.lineTo(x + 1, y - 13); ctx.lineTo(x + 3, y); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 2, y); ctx.lineTo(x + 5, y - 7); ctx.lineTo(x + 7, y); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 1, y - 10, 1, 7);
        ctx.globalAlpha = 0.2 + 0.15 * Math.sin(t * 2 + d.v * 9); ctx.beginPath(); ctx.arc(x, y - 6, 10, 0, 7); ctx.fill(); break;
      }
      case 'pebble':
        ctx.fillStyle = G.L.theme.groundDark; ctx.beginPath(); ctx.ellipse(x, y - 2, 4, 2.5, 0, 0, 7); ctx.fill(); break;
      case 'pine':
        ctx.fillStyle = '#6b4a35'; ctx.fillRect(x - 1, y - 4, 2, 4);
        ctx.fillStyle = '#3b7a63'; ctx.beginPath(); ctx.moveTo(x - 6, y - 4); ctx.lineTo(x, y - 16); ctx.lineTo(x + 6, y - 4); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 3, y - 11); ctx.lineTo(x, y - 16); ctx.lineTo(x + 3, y - 11); ctx.fill(); break;
      case 'snowball':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 3, 4, 0, 7); ctx.fill(); break;
      case 'cactus':
        ctx.fillStyle = '#5fa04e'; rr(ctx, x - 2.5, y - 14, 5, 14, 2.5); ctx.fill(); rr(ctx, x - 7, y - 10, 3, 6, 1.5); ctx.fill(); rr(ctx, x + 4, y - 12, 3, 6, 1.5); ctx.fill();
        ctx.fillStyle = '#ff7aa8'; ctx.beginPath(); ctx.arc(x, y - 15, 1.8, 0, 7); ctx.fill(); break;
      case 'bones':
        ctx.fillStyle = '#f6ecd9'; ctx.fillRect(x - 4, y - 2, 8, 1.6); ctx.beginPath(); ctx.arc(x - 4, y - 1.2, 1.3, 0, 7); ctx.arc(x + 4, y - 1.2, 1.3, 0, 7); ctx.fill(); break;
      case 'vent':
        ctx.fillStyle = '#3a2422'; ctx.beginPath(); ctx.ellipse(x, y - 1, 5, 2, 0, 0, 7); ctx.fill();
        if (Math.random() < 0.03) spawnParticle(x, y - 2, (Math.random() - 0.5) * 10, -40, 1.2, '#ff8a3a', 2, 'dot', -10); break;
      case 'star':
        ctx.fillStyle = '#ffe36e'; ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 3 + d.v * 10); ctx.translate(x, y - 8); ctx.rotate(t * 0.5);
        ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 1.6 : 4, a = i / 10 * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.fill(); break;
      case 'column':
        ctx.fillStyle = '#b9ad98'; ctx.fillRect(x - 3, y - 12, 6, 12); ctx.fillStyle = '#a59a85'; ctx.fillRect(x - 4.5, y - 13, 9, 2.5); break;
      case 'gear':
        ctx.translate(x, y - 5); ctx.rotate(t * 0.3 + d.v); ctx.fillStyle = '#8a7d66';
        for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-1.2, -6, 2.4, 3); }
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); ctx.fillStyle = G.L.theme.ground; ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, 7); ctx.fill(); break;
    }
    ctx.restore();
  }

  function drawTiles(ctx, x0, x1, y0, y1, t) {
    const L = G.L, th = L.theme;
    // updraft zones first
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (tileAt(tx, ty) !== 'U') continue;
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(tx * T, ty * T, T, T);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const off = ((t * 90 + hash(tx, i) % 32 + i * 16) % 32);
        const sx = tx * T + 6 + ((hash(tx, ty + i) % 20));
        ctx.beginPath(); ctx.moveTo(sx, ty * T + T - off); ctx.lineTo(sx, ty * T + T - off - 8); ctx.stroke();
      }
    }
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = tileAt(tx, ty);
        const px = tx * T, py = ty * T;
        switch (c) {
          case '#': {
            const m = groundMask(tx, ty, '#');
            const v = hash(tx, ty) % 4;
            ctx.drawImage(sprite('g' + v + '_' + m, (x) => drawGround(x, v, m)), px, py, T, T);
            break;
          }
          case 'I': { const m = groundMask(tx, ty, 'I'); ctx.drawImage(sprite('i' + m, (x) => drawIce(x, m)), px, py, T, T); break; }
          case '^': ctx.drawImage(sprite('spk', (x) => drawSpikes(x, true)), px, py, T, T); break;
          case 'v': ctx.drawImage(sprite('spkd', (x) => drawSpikes(x, false)), px, py, T, T); break;
          case '=': ctx.drawImage(sprite('plank', drawPlank), px, py, T, T); break;
          case '~': {
            const wv = Math.sin(t * 3 + tx * 0.9) * 2;
            const g = ctx.createLinearGradient(0, py + 8, 0, py + T);
            g.addColorStop(0, '#ffcf4a'); g.addColorStop(0.35, '#ff7a1a'); g.addColorStop(1, '#c2261a');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.moveTo(px, py + 12 + wv); ctx.quadraticCurveTo(px + 16, py + 8 - wv, px + T, py + 12 + Math.sin(t * 3 + (tx + 1) * 0.9) * 2); ctx.lineTo(px + T, py + T); ctx.lineTo(px, py + T); ctx.closePath(); ctx.fill();
            ctx.fillStyle = 'rgba(255,140,40,0.18)'; ctx.fillRect(px, py - 10, T, 22);
            if (Math.random() < 0.004) spawnParticle(px + Math.random() * T, py + 12, (Math.random() - 0.5) * 30, -120 - Math.random() * 80, 1, '#ffb347', 2.5, 'dot', 300);
            break;
          }
          case 'B': {
            const ba = G.bounceAnim.get(ty * L.W + tx);
            const k = ba !== undefined ? Math.max(0, 1 - (t - ba) * 4) : 0;
            const sq = Math.sin(k * Math.PI) * 5;
            ctx.fillStyle = '#f2e3c9'; rr(ctx, px + 10, py + 12, 12, 20, 4); ctx.fill();
            ctx.fillStyle = '#e8434f';
            ctx.beginPath(); ctx.ellipse(px + 16, py + 14 + sq * 0.6, 17 + sq * 0.6, 11 - sq, 0, Math.PI, 0); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(px + 9, py + 8 + sq, 2.5, 0, 7); ctx.arc(px + 19, py + 6 + sq, 3, 0, 7); ctx.arc(px + 26, py + 11 + sq * 0.8, 2, 0, 7); ctx.fill();
            break;
          }
          case '<': case '>': {
            ctx.fillStyle = '#3d3a4a'; rr(ctx, px, py, T, T, 4); ctx.fill();
            ctx.fillStyle = '#585468'; ctx.fillRect(px, py, T, 9);
            const dir = c === '>' ? 1 : -1, off = ((t * 60 * dir) % 12 + 12) % 12;
            ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = 2;
            for (let i = -1; i < 3; i++) {
              const cx = px + i * 12 + off;
              if (cx < px - 2 || cx > px + T - 4) continue;
              ctx.beginPath(); ctx.moveTo(cx, py + 2); ctx.lineTo(cx + 3 * dir, py + 4.5); ctx.lineTo(cx, py + 7); ctx.stroke();
            }
            ctx.fillStyle = '#29262f'; ctx.beginPath(); ctx.arc(px + 8, py + 20, 4, 0, 7); ctx.arc(px + 24, py + 20, 4, 0, 7); ctx.fill();
            break;
          }
          case 'C': {
            const s = G.crumble.get(ty * L.W + tx);
            if (s && s.broken) {
              ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([3, 3]); ctx.strokeRect(px + 2, py + 2, T - 4, T - 4); ctx.setLineDash([]);
              break;
            }
            const shake = s ? Math.sin(t * 60) * 1.5 : 0;
            ctx.save(); ctx.translate(shake, 0);
            ctx.fillStyle = th.groundDark; rr(ctx, px + 1, py + 1, T - 2, T - 2, 5); ctx.fill();
            ctx.fillStyle = th.ground; rr(ctx, px + 2, py + 2, T - 4, T - 7, 4); ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.moveTo(px + 8, py + 3); ctx.lineTo(px + 13, py + 12); ctx.lineTo(px + 10, py + 20); ctx.moveTo(px + 13, py + 12); ctx.lineTo(px + 22, py + 15); ctx.lineTo(px + 26, py + 26); ctx.stroke();
            ctx.restore();
            break;
          }
          case 'D': case 'K': case 'Q': {
            const g = L.doorGroup[ty * L.W + tx];
            const a = G.doorAnim[g] || 0;
            const col = GROUP_COLORS[g.split(':')[1]] || '#35c6b0';
            const top = tileAt(tx, ty - 1) !== c;
            ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px + 4, py, T - 8, T);
            if (a < 0.999) {
              const h = T * (1 - a);
              ctx.fillStyle = '#4a4458'; ctx.fillRect(px + 5, py, T - 10, h);
              ctx.fillStyle = col; ctx.fillRect(px + 5, py, 3, h); ctx.fillRect(px + T - 8, py, 3, h);
              ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(px + 10, py, 3, h);
              if (c === 'Q' && h > 20 && tileAt(tx, ty + 1) !== 'Q') { ctx.fillStyle = col; heartPath(ctx, px + 16, py + h - 16, 14); ctx.fill(); }
            }
            if (top) { ctx.fillStyle = col; rr(ctx, px + 2, py - 3, T - 4, 6, 2); ctx.fill(); }
            break;
          }
          case 'b': case 'g': {
            const col = c === 'b' ? '80,150,255' : '255,100,170';
            ctx.fillStyle = `rgba(${col},0.28)`; ctx.fillRect(px + 6, py, T - 12, T);
            ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
              const yy = py + ((t * 30 + i * 11) % T);
              ctx.beginPath(); ctx.moveTo(px + 7, yy); ctx.lineTo(px + T - 7, yy); ctx.stroke();
            }
            ctx.fillStyle = `rgba(${col},1)`; ctx.fillRect(px + 5, py, 2, T); ctx.fillRect(px + T - 7, py, 2, T);
            if (tileAt(tx, ty - 1) !== c) {
              ctx.fillStyle = `rgba(${col},1)`; ctx.beginPath(); ctx.arc(px + 16, py - 6, 7, 0, 7); ctx.fill();
              ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(c === 'b' ? '♂' : '♀', px + 16, py - 5.5);
            }
            break;
          }
        }
      }
    }
  }

  function drawEntities(ctx, t) {
    const L = G.L, th = L.theme;
    // plates
    for (const pl of L.plates) {
      const col = pl.kind === 'latch' ? GROUP_COLORS.L : GROUP_COLORS[pl.group.split(':')[1]];
      const latched = pl.kind === 'latch' && G.latched[pl.group];
      const h = pl.down || latched ? 2 : 5;
      ctx.fillStyle = '#5a5568'; rr(ctx, pl.x + 2, pl.y + T - 5, T - 4, 5, 2); ctx.fill();
      ctx.fillStyle = col; rr(ctx, pl.x + 5, pl.y + T - 5 - h, T - 10, h + 1, 2); ctx.fill();
      if (pl.down || latched) { ctx.fillStyle = col; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.ellipse(pl.x + 16, pl.y + T - 6, 18, 6, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    }
    // moving platforms
    for (const m of L.movers) {
      if (m.ax) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(m.x0 + m.w / 2, m.y0 + 6); ctx.lineTo(m.x0 + m.ax * T + m.w / 2, m.y0 + 6); ctx.stroke(); ctx.setLineDash([]); }
      if (m.ay) { ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(m.x0 + m.w / 2, m.y0 + 6); ctx.lineTo(m.x0 + m.w / 2, m.y0 + m.ay * T + 6); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; rr(ctx, m.x + 1, m.y + 3, m.w - 2, m.h, 4); ctx.fill();
      ctx.fillStyle = th.plank; rr(ctx, m.x, m.y, m.w, m.h, 4); ctx.fill();
      ctx.fillStyle = '#ffcf4a'; ctx.fillRect(m.x + 3, m.y + 2, m.w - 6, 2.5);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 0; i < m.w / T; i++) { ctx.beginPath(); ctx.arc(m.x + 8 + i * T, m.y + 8, 1.4, 0, 7); ctx.arc(m.x + 24 + i * T, m.y + 8, 1.4, 0, 7); ctx.fill(); }
    }
    // saws
    for (const s of L.saws) {
      if (s.ay) { ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x0, s.y0 + s.ay * T); ctx.stroke(); }
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(t * 9);
      ctx.fillStyle = '#d7dbe3';
      ctx.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? s.r - 3 : s.r + 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9aa1ae'; ctx.beginPath(); ctx.arc(0, 0, s.r - 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8344e'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, 7); ctx.fill();
      ctx.restore();
    }
    // checkpoints
    L.checkpoints.forEach((c, i) => {
      if (i === 0) return;
      const active = i <= G.cp;
      ctx.fillStyle = '#8a6a50'; ctx.fillRect(c.x - 1.5, c.y - 54, 3, 54);
      ctx.fillStyle = '#6b5240'; rr(ctx, c.x - 6, c.y - 4, 12, 4, 2); ctx.fill();
      const wave = Math.sin(t * 5) * (active ? 3 : 1);
      ctx.fillStyle = active ? '#ff5d8f' : '#b9b3c4';
      ctx.beginPath(); ctx.moveTo(c.x + 1.5, c.y - 54); ctx.quadraticCurveTo(c.x + 14, c.y - 56 + wave, c.x + 24, c.y - 50 + wave); ctx.quadraticCurveTo(c.x + 14, c.y - 44 - wave, c.x + 1.5, c.y - 40); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; heartPath(ctx, c.x + 11, c.y - 48 + wave * 0.5, 7); ctx.fill();
      if (active) { ctx.fillStyle = 'rgba(255,93,143,0.18)'; ctx.beginPath(); ctx.arc(c.x, c.y - 30, 26, 0, 7); ctx.fill(); }
    });
    // signs
    for (const s of L.signs) {
      ctx.fillStyle = '#7a5a40'; ctx.fillRect(s.x - 2, s.y - 22, 4, 22);
      ctx.fillStyle = '#c99a63'; rr(ctx, s.x - 14, s.y - 34, 28, 16, 3); ctx.fill();
      ctx.fillStyle = '#7a5a40'; ctx.font = 'bold 12px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', s.x, s.y - 25.5);
    }
    // goal: a heart archway
    const g = L.goal;
    if (g) {
      const gx = g.x, gy = g.y;
      const glow = 0.5 + 0.5 * Math.sin(t * 3);
      const gg = ctx.createRadialGradient(gx, gy - 60, 10, gx, gy - 60, 110);
      gg.addColorStop(0, `rgba(255,140,180,${0.35 + glow * 0.15})`); gg.addColorStop(1, 'rgba(255,140,180,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(gx, gy - 60, 110, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a5a3c'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(gx - 46, gy); ctx.lineTo(gx - 46, gy - 70); ctx.quadraticCurveTo(gx - 46, gy - 112, gx, gy - 112); ctx.quadraticCurveTo(gx + 46, gy - 112, gx + 46, gy - 70); ctx.lineTo(gx + 46, gy); ctx.stroke();
      ctx.strokeStyle = '#5fae55'; ctx.lineWidth = 3;
      ctx.beginPath(); for (let i = 0; i <= 20; i++) { const a = Math.PI + i / 20 * Math.PI; const r = 46 + Math.sin(i * 1.7) * 3; ctx.lineTo(gx + Math.cos(a) * r, gy - 70 + Math.sin(a) * r * 0.92); } ctx.stroke();
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i + 0.5) / 9 * Math.PI;
        ctx.fillStyle = i % 2 ? '#ff8fb1' : '#fff0f5';
        ctx.beginPath(); ctx.arc(gx + Math.cos(a) * 46, gy - 70 + Math.sin(a) * 42, 4, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#ff4d7e';
      const hs = 26 + glow * 4;
      heartPath(ctx, gx, gy - 128, hs); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(gx - hs * 0.22, gy - 134, hs * 0.1, hs * 0.06, -0.6, 0, 7); ctx.fill();
    }
    // hearts
    L.hearts.forEach(h => {
      if (h.taken) return;
      const by = h.y + Math.sin(t * 3 + h.x) * 3;
      ctx.fillStyle = 'rgba(255,93,143,0.25)'; ctx.beginPath(); ctx.arc(h.x, by, 15 + Math.sin(t * 4) * 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3d73'; heartPath(ctx, h.x, by, 22); ctx.fill();
      ctx.fillStyle = '#ff7aa1'; heartPath(ctx, h.x, by - 1, 15); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.ellipse(h.x - 5, by - 4, 2.5, 1.6, -0.6, 0, 7); ctx.fill();
    });
  }

  function drawRope(ctx) {
    const R = G.rope; if (R.length < 2) return;
    const tens = G.ropeTension;
    const path = () => {
      ctx.beginPath(); ctx.moveTo(R[0].x, R[0].y);
      for (let i = 1; i < R.length - 1; i++) { const mx = (R[i].x + R[i + 1].x) / 2, my = (R[i].y + R[i + 1].y) / 2; ctx.quadraticCurveTo(R[i].x, R[i].y, mx, my); }
      ctx.lineTo(R[R.length - 1].x, R[R.length - 1].y);
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    path(); ctx.strokeStyle = 'rgba(90,0,25,0.35)'; ctx.lineWidth = 5; ctx.stroke();
    path(); ctx.strokeStyle = tens > 0.6 ? '#ff3355' : '#e3304b'; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.save(); ctx.translate(0, -0.8); path(); ctx.strokeStyle = 'rgba(255,190,200,0.75)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    const mid = R[Math.floor(R.length / 2)];
    ctx.fillStyle = '#ff2d55'; heartPath(ctx, mid.x, mid.y + 1, 11); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(mid.x - 2, mid.y - 1, 1.1, 0, 7); ctx.fill();
  }

  function drawParticles(ctx) {
    for (const p of G.particles) {
      const a = Math.min(1, p.life / p.max * 1.5);
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      if (p.type === 'heart') { heartPath(ctx, p.x, p.y, p.size * 1.6); ctx.fill(); }
      else if (p.type === 'star') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -0.8, p.size, 1.6); ctx.fillRect(-0.8, -p.size / 2, 1.6, p.size); ctx.restore(); }
      else if (p.type === 'rock') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 7); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  function drawDarkness(ctx) {
    const d = G.darkCtx, z = G.zoom, cx = G.camPx, cy = G.camPy;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, G.cw, G.ch);
    d.fillStyle = 'rgba(4,6,22,0.94)'; d.fillRect(0, 0, G.cw, G.ch);
    d.globalCompositeOperation = 'destination-out';
    const light = (wx, wy, r, s) => {
      const sx = wx * z - cx, sy = wy * z - cy, sr = r * z;
      if (sx < -sr || sy < -sr || sx > G.cw + sr || sy > G.ch + sr) return;
      const g = d.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, `rgba(0,0,0,${s})`); g.addColorStop(0.55, `rgba(0,0,0,${s * 0.85})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.beginPath(); d.arc(sx, sy, sr, 0, 7); d.fill();
    };
    const L = G.L, t = G.t;
    for (const ch of ['boy', 'girl']) { const p = G.players[ch]; light(p.x + PW / 2, p.y + PH / 2, 165 + Math.sin(t * 6 + (ch === 'boy' ? 0 : 2)) * 4, 1); }
    L.hearts.forEach(h => { if (!h.taken) light(h.x, h.y, 46, 0.9); });
    L.checkpoints.forEach((c, i) => { if (i && i <= G.cp) light(c.x, c.y - 30, 110, 0.9); else if (i) light(c.x, c.y - 30, 40, 0.6); });
    L.signs.forEach(s => light(s.x, s.y - 20, 50, 0.7));
    L.saws.forEach(s => light(s.x, s.y, 44, 0.7));
    if (L.goal) light(L.goal.x, L.goal.y - 70, 170, 1);
    for (const dc of L.decor) if (dc.type === 'glowflower') light(dc.x, dc.y - 12, 36, 0.6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(G.dark, 0, 0);
    // warm lantern tint
    ctx.globalCompositeOperation = 'lighter';
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch], sx = (p.x + PW / 2) * z - cx, sy = (p.y + PH / 2) * z - cy, sr = 120 * z;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, 'rgba(255,190,110,0.12)'); g.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function wrapText(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }
  function bubble(ctx, sx, sy, lines, fs, opts) {
    const d = G.dpr, pad = 10 * d, lh = fs * 1.3;
    let w = 0; for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
    const bw = w + pad * 2, bh = lines.length * lh + pad * 1.4;
    let bx = sx - bw / 2; bx = clamp(bx, 8 * d, G.cw - bw - 8 * d);
    const by = sy - bh - 10 * d;
    ctx.fillStyle = 'rgba(40,20,50,0.18)'; rr(ctx, bx + 2 * d, by + 3 * d, bw, bh, 12 * d); ctx.fill();
    ctx.fillStyle = (opts && opts.bg) || 'rgba(255,255,255,0.96)'; rr(ctx, bx, by, bw, bh, 12 * d); ctx.fill();
    ctx.beginPath(); ctx.moveTo(sx - 7 * d, by + bh - 1); ctx.lineTo(sx, by + bh + 8 * d); ctx.lineTo(sx + 7 * d, by + bh - 1); ctx.fill();
    ctx.fillStyle = (opts && opts.fg) || '#4a2c55';
    lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + pad * 0.7 + lh * (i + 0.5)));
  }

  function drawOverlays(ctx) {
    const z = G.zoom, d = G.dpr, L = G.L;
    const toS = (wx, wy) => ({ x: wx * z - G.camPx, y: wy * z - G.camPy });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // signs
    for (const s of L.signs) {
      let near = false;
      for (const ch of ['boy', 'girl']) { const p = G.players[ch]; if ((p.local || G.mode === 'local') && Math.abs(p.x + PW / 2 - s.x) < 150 && Math.abs(p.y - s.y) < 140) near = true; }
      if (!near || !s.text) continue;
      const fs = Math.round(15 * d);
      ctx.font = `500 ${fs}px Fredoka, sans-serif`;
      const lines = wrapText(ctx, s.text, Math.min(340 * d, G.cw * 0.8));
      const sp = toS(s.x, s.y - 40);
      bubble(ctx, sp.x, sp.y, lines, fs);
    }
    // names & emotes
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      const sp = toS(p.x + PW / 2, p.y - 18);
      if (p.emoteT > 0) {
        const fs = Math.round(17 * d);
        ctx.font = `600 ${fs}px Fredoka, sans-serif`;
        ctx.globalAlpha = Math.min(1, p.emoteT * 3);
        bubble(ctx, sp.x, sp.y - 6 * d, [p.emote], fs);
        ctx.globalAlpha = 1;
      } else if (G.mode === 'online' || G.introT > 0) {
        const name = G.mode === 'online' ? (p.local ? 'You' : (G.names[ch] || 'Partner')) : (G.schemes[ch] === 'p1' ? 'P1 · WASD' : 'P2 · Arrows');
        const fs = Math.round(12 * d);
        ctx.font = `600 ${fs}px Fredoka, sans-serif`;
        const w = ctx.measureText(name).width + 12 * d;
        ctx.globalAlpha = p.local && G.mode === 'online' && G.introT <= 0 ? 0.55 : 0.9;
        ctx.fillStyle = ch === 'boy' ? 'rgba(60,120,230,0.85)' : 'rgba(240,80,140,0.85)';
        rr(ctx, sp.x - w / 2, sp.y - 9 * d, w, 18 * d, 9 * d); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillText(name, sp.x, sp.y + 0.5 * d);
        ctx.globalAlpha = 1;
      }
    }
    // kiss prompt when the two stand side by side
    if (canKiss() && G.introT <= 0) {
      const m = kissMid(), sp = toS(m.x, m.y - 30);
      const label = G.mode === 'online' ? '💋 Press K' : '💋 F / L';
      const fs = Math.round(13 * d);
      ctx.font = `600 ${fs}px Fredoka, sans-serif`;
      const w = ctx.measureText(label).width + 16 * d;
      const bob = Math.sin(G.t * 4) * 2 * d;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; rr(ctx, sp.x - w / 2, sp.y - 11 * d + bob, w, 22 * d, 11 * d); ctx.fill();
      ctx.fillStyle = '#e23a6e'; ctx.fillText(label, sp.x, sp.y + 0.5 * d + bob);
    }
    // reel / anchor hints (tiny icons)
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      if (p.anchored) {
        const sp = toS(p.x + PW / 2, p.y + PH + 8);
        ctx.font = `${Math.round(11 * d)}px Fredoka, sans-serif`; ctx.fillStyle = 'rgba(255,214,102,0.95)'; ctx.fillText('⚓', sp.x, sp.y);
      }
    }
    // intro title card
    if (G.introT > 0) {
      const a = Math.min(1, G.introT * 2);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(30,10,40,0.35)'; ctx.fillRect(0, G.ch * 0.36, G.cw, G.ch * 0.2);
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(38 * d)}px Fredoka, sans-serif`;
      ctx.fillText(`${L.world.icon} ${L.name}`, G.cw / 2, G.ch * 0.44);
      ctx.font = `500 ${Math.round(16 * d)}px Fredoka, sans-serif`;
      ctx.fillText(`${L.world.name} · Stage ${L.n} of 100`, G.cw / 2, G.ch * 0.51);
      ctx.globalAlpha = 1;
    }
    // respawn fade
    if (G.respawnT > 0) {
      const a = G.respawnT > 0.42 ? (0.85 - G.respawnT) / 0.43 : G.respawnT / 0.42;
      ctx.fillStyle = `rgba(40,10,40,${clamp(a, 0, 1) * 0.85})`; ctx.fillRect(0, 0, G.cw, G.ch);
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.fillStyle = '#ff7aa8'; heartPath(ctx, G.cw / 2, G.ch / 2, 70 * d); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // =====================================================================
  //  Camera & main render
  // =====================================================================
  function camTarget() {
    const L = G.L, vw = G.cw / G.zoom, vh = G.ch / G.zoom;
    const a = G.players.boy, b = G.players.girl;
    let fx, fy;
    if (G.mode === 'online') {
      const me = G.players[G.myChar], o = G.players[other(G.myChar)];
      fx = me.x * 0.62 + o.x * 0.38 + PW / 2; fy = me.y * 0.62 + o.y * 0.38 + PH / 2;
    } else { fx = (a.x + b.x) / 2 + PW / 2; fy = (a.y + b.y) / 2 + PH / 2; }
    let tx = fx - vw / 2, ty = fy - vh * 0.6;
    const maxX = L.W * T - vw, maxY = (L.H - 2) * T - vh;
    tx = maxX < 0 ? maxX / 2 : clamp(tx, 0, maxX);
    ty = maxY < 0 ? maxY / 2 : clamp(ty, 0, maxY);
    return { x: tx, y: ty };
  }
  function snapCamera() { if (!G.canvas) return; resize(); const c = camTarget(); G.cam.x = c.x; G.cam.y = c.y; }

  function render(dt) {
    const ctx = G.ctx, L = G.L, th = L.theme, z = G.zoom, t = G.t;
    const c = camTarget();
    const k = 1 - Math.pow(0.002, dt);
    G.cam.x += (c.x - G.cam.x) * k; G.cam.y += (c.y - G.cam.y) * k;
    const vw = G.cw / z, vh = G.ch / z;
    G.camPx = Math.round(G.cam.x * z); G.camPy = Math.round(G.cam.y * z);
    drawBackground(ctx, th, G.cam.x, G.cam.y, Math.max(0, L.H * T - vh));
    ctx.setTransform(z, 0, 0, z, -G.camPx, -G.camPy);
    ctx.imageSmoothingEnabled = true;
    const x0 = Math.max(0, Math.floor(G.cam.x / T) - 1), x1 = Math.min(L.W - 1, Math.floor((G.cam.x + vw) / T) + 1);
    const y0 = Math.max(0, Math.floor(G.cam.y / T) - 1), y1 = Math.min(L.H - 1, Math.floor((G.cam.y + vh) / T) + 1);
    for (const d of L.decor) if (d.x > G.cam.x - 40 && d.x < G.cam.x + vw + 40) drawDecor(ctx, d, t);
    drawTiles(ctx, x0, x1, y0, y1, t);
    drawEntities(ctx, t);
    drawRope(ctx);
    const order = G.mode === 'online' ? [other(G.myChar), G.myChar] : ['boy', 'girl'];
    for (const ch of order) drawCharacter(ctx, G.players[ch], t);
    if (G.kissT > 0) {
      const m = kissMid(), k = 1.4 - G.kissT;
      const s = Math.min(1, k * 5) * (26 + Math.sin(k * 14) * 4);
      ctx.globalAlpha = Math.min(1, G.kissT * 2.5);
      ctx.fillStyle = 'rgba(255,93,143,0.25)'; ctx.beginPath(); ctx.arc(m.x, m.y - 22 - k * 16, s * 0.9, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3d73'; heartPath(ctx, m.x, m.y - 22 - k * 16, s); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.ellipse(m.x - s * 0.22, m.y - 26 - k * 16, s * 0.1, s * 0.06, -0.6, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawParticles(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawAmbient(ctx, th.particle, dt);
    if (L.dark) drawDarkness(ctx);
    const vg = ctx.createRadialGradient(G.cw / 2, G.ch / 2, G.ch * 0.45, G.cw / 2, G.ch / 2, G.ch * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,10,40,0.28)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, G.cw, G.ch);
    drawOverlays(ctx);
  }

  // ---------- menu background scene ----------
  const menuPlayers = { boy: makePlayer('boy'), girl: makePlayer('girl') };
  function renderMenu(dt) {
    const ctx = G.ctx; G.menuT += dt;
    const th = HS.THEMES.meadow;
    if (!G.ambient.length) initAmbient();
    const fakeL = { theme: th, themeKey: 'meadow' };
    const saveL = G.L; G.L = fakeL;
    drawBackground(ctx, th, G.menuT * 25, 0, 0);
    G.L = saveL;
    const z = Math.max(1.5, G.ch / (12 * T));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const groundY = G.ch * 0.86;
    ctx.fillStyle = th.ground; ctx.fillRect(0, groundY, G.cw, G.ch - groundY);
    ctx.fillStyle = th.top; ctx.fillRect(0, groundY, G.cw, 8 * z);
    ctx.fillStyle = th.topLight; ctx.fillRect(0, groundY, G.cw, 2 * z);
    const cx = G.cw / 2;
    const b = menuPlayers.boy, g = menuPlayers.girl;
    const hop = Math.max(0, Math.sin(G.menuT * 2.2)) * 10;
    b.x = -46; b.y = -PH; b.face = 1; b.grounded = true; b.blinkT -= dt; if (b.blinkT < -0.12) b.blinkT = 2 + Math.random() * 3;
    g.x = 24; g.y = -PH - hop; g.face = -1; g.grounded = hop < 1; g.blinkT -= dt; if (g.blinkT < -0.12) g.blinkT = 2 + Math.random() * 3;
    ctx.setTransform(z, 0, 0, z, cx, groundY);
    // rope
    const ax = b.x + PW / 2 + 7, ay = b.y + PH - 13, bx = g.x + PW / 2 - 7, by = g.y + PH - 13;
    ctx.strokeStyle = '#e3304b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 16 - hop * 0.5, bx, by); ctx.stroke();
    ctx.fillStyle = '#ff2d55'; heartPath(ctx, (ax + bx) / 2, (ay + by) / 2 + 8 - hop * 0.25, 11); ctx.fill();
    drawCharacter(ctx, b, G.menuT); drawCharacter(ctx, g, G.menuT);
    if (Math.random() < dt * 1.2) G.particles.push({ x: (Math.random() - 0.5) * 60, y: -50, vx: (Math.random() - 0.5) * 20, vy: -40, life: 2, max: 2, color: '#ff7aa8', size: 5, type: 'heart', g: -5, rot: 0 });
    for (let i = G.particles.length - 1; i >= 0; i--) { const p = G.particles[i]; p.life -= dt; if (p.life <= 0) { G.particles.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; }
    drawParticles(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawAmbient(ctx, 'petal', dt);
  }

  // =====================================================================
  //  Loop
  // =====================================================================
  let last = 0, acc = 0;
  function frame(ts) {
    global.requestAnimationFrame(frame);
    const dt = Math.min(0.1, (ts - last) / 1000 || 0); last = ts;
    resize();
    if ((G.state === 'play' || G.state === 'won') && G.L) {
      if (!(G.paused && G.mode === 'local')) {
        acc += dt;
        let n = 0;
        while (acc >= DT && n < 14) { step(DT); acc -= DT; n++; }
        if (n >= 14) acc = 0;
      }
      netTick(dt);
      render(dt);
      G.hudAcc += dt;
      if (G.hudAcc > 0.2 && G.hooks.hud) {
        G.hudAcc = 0;
        G.hooks.hud({ hearts: G.L.hearts.filter(h => h.taken).length, total: G.L.hearts.length, time: G.time, deaths: G.deaths, ping: G.ping });
      }
    } else {
      if (G.state !== 'menu') G.state = 'menu';
      if (G.particles.length > 60) G.particles.length = 0;
      renderMenu(dt);
    }
  }

  function init(canvas) {
    G.canvas = canvas; G.ctx = canvas.getContext('2d');
    G.dark = document.createElement('canvas'); G.darkCtx = G.dark.getContext('2d');
    resize();
    global.addEventListener('keydown', onKeyDown);
    global.addEventListener('keyup', onKeyUp);
    global.addEventListener('blur', () => G.keys.clear());
    initAmbient();
    global.requestAnimationFrame(frame);
  }

  function drawPreview(canvas, char, t) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const p = makePlayer(char);
    p.face = char === 'boy' ? 1 : -1; p.grounded = true;
    p.blinkT = (Math.sin(t * 0.7 + (char === 'boy' ? 0 : 2)) > 0.97) ? -0.05 : 1;
    p.x = -PW / 2; p.y = -PH;
    const s = canvas.height / 60;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2, canvas.height * 0.86);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 3, 0, 0, 7); ctx.fill();
    drawCharacter(ctx, p, t);
  }

  global.Game = {
    init, startLevel, stop, onNet, drawPreview,
    setHooks(h) { Object.assign(G.hooks, h); },
    setPaused(v) { G.paused = !!v; G.keys.clear(); },
    setPing(ms) { G.ping = ms; },
    get state() { return G.state; },
    get level() { return G.L; },
    _G: G, _step: step, _kiss: tryKiss, _const: { P, ROPE_MAX, PW, PH, DT },
  };
})(typeof window !== 'undefined' ? window : globalThis);
