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
    p1: { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'], anchor: ['KeyS'], reel: ['KeyE'], emote: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], kiss: ['KeyF'], dance: ['KeyZ'], matcha: ['KeyX'], say: ['KeyC'], eat: ['KeyV'], shine: ['KeyG'], orange: ['KeyR'], magic: ['KeyT'], super: ['KeyQ'], outfit: ['KeyB'] },
    p2: { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], anchor: ['ArrowDown'], reel: ['ShiftRight', 'Slash', 'Period', 'Numpad0'], emote: ['Digit7', 'Digit8', 'Digit9', 'Digit0'], kiss: ['KeyL', 'Numpad1'], dance: ['KeyN'], matcha: ['KeyM'], say: ['KeyJ'], eat: ['KeyK'], shine: ['KeyI'], orange: ['KeyO'], magic: ['KeyU'], super: ['KeyP', 'Numpad2'], outfit: ['KeyY'] },
    solo: { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp', 'Space'], anchor: ['KeyS', 'ArrowDown', 'ShiftLeft'], reel: ['KeyE', 'ShiftRight'], emote: ['Digit1', 'Digit2', 'Digit3', 'Digit4'], kiss: ['KeyK', 'KeyF'], dance: ['KeyZ'], matcha: ['KeyX'], say: ['Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'], eat: ['KeyV'], shine: ['KeyG'], orange: ['KeyR'], magic: ['KeyT'], super: ['KeyQ'], outfit: ['KeyB'] },
  };
  const tr = (k, v) => (global.I18N ? global.I18N.t(k, v) : k);
  const trList = (k, i) => { const l = tr(k); return Array.isArray(l) ? l[i] || l[0] : ''; };
  const NPHRASES = 5;
  const CELEBS = ['fireworks', 'starRain', 'heartSpiral', 'unicorn', 'confetti', 'bigHeart', 'balloons'];
  const RAINBOW = ['#ff5b6e', '#ffa94d', '#ffe066', '#69db7c', '#4dabf7', '#b197fc'];

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
      act: null, actT: 0, actDur: 0, actFx: 0, sipped: false, idleT: 0, say: null, typing: false, typingT: 0, sayIdx: 0,
      shineT: 0, glowT: 0, trailT: 0, chewT: 0, morphT: 0, morphForm: null, bridalT: 0, outfit: 0, groom: false, castT: 0, superT: 0, punchT: 0, superCd: 0,
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
    critters: [], critterT: 1.2, bgT: 0, shoot: null, fx: [], fxCritters: [], celeb: null,
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
      case '#': return !(G.holes && G.holes.size && G.holes.has(ty * G.L.W + tx));
      case 'I': case 'B': case '<': case '>': return true;
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
        if (km.dance.includes(e.code)) startAct(ch, 'dance', true);
        if (km.matcha.includes(e.code)) startAct(ch, 'matcha', true);
        if (km.eat.includes(e.code)) startAct(ch, 'eat', true);
        if (km.shine.includes(e.code)) startShine(ch, true);
        if (km.orange.includes(e.code)) startAct(ch, 'orange', true);
        if (km.magic.includes(e.code)) doMagic(ch, true);
        if (km.outfit.includes(e.code)) cycleOutfit(ch, true);
        if (km.super.includes(e.code)) trySuper(ch, true);
        const si = km.say.indexOf(e.code);
        if (si >= 0) {
          const p = G.players[ch];
          const idx = km.say.length > 1 ? si : (p.sayIdx++ % NPHRASES);
          sayPhrase(ch, idx, true);
        }
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
    G.celeb = null; G.fx = []; G.fxCritters = [];
    G.players = { boy: makePlayer('boy'), girl: makePlayer('girl') };
    initHard();
    G.players.girl.outfit = G.savedOutfit || 0;
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
    if (G.mon) { if (isAuth()) resetMonsters(); else { G.monGrace = 2.2; G.bombs = []; G.holes.clear(); } G.boT = Math.min(G.boT, 0.3); }
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
      const busy = inp.left || inp.right || inp.jump || inp.anchor || inp.reel;
      if (busy) p.idleT = 0;
      else if (p.grounded && !p.anchored && Math.abs(p.vx) < 5 && !p.act && G.state === 'play' && G.introT <= 0) p.idleT += dt;
      if (p.idleT > 14) {
        p.idleT = -8;
        const r = Math.random();
        startAct(ch, ch === 'girl' ? (r < 0.5 ? 'matcha' : r < 0.7 ? 'eat' : 'dance') : (r < 0.4 ? 'eat' : 'dance'), true);
      }
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
      updateAct(p, dt);
      if (p.say) { p.say.age += dt; if (p.say.age > p.say.dur) p.say = null; }
      if (p.typing) { p.typingT -= dt; if (p.typingT <= 0) p.typing = false; }
      if (ch === 'girl' && !p.anchored && G.respawnT <= 0) {
        const sp = p.local ? Math.abs(p.vx) : Math.abs(p.nvx);
        if (sp > 50) {
          p.trailT -= dt * Math.min(1.3, sp / 200);
          if (p.trailT <= 0) {
            p.trailT = 0.032;
            const cx = p.x + PW / 2 - p.face * 7, big = Math.random() < 0.45;
            spawnParticle(cx + (Math.random() - 0.5) * 6, p.y + PH - 4 - Math.random() * 10, -p.face * (15 + Math.random() * 30), -25 - Math.random() * 45, 0.6 + Math.random() * 0.4,
              ['#ffe066', '#ffc2dd', '#ffffff', '#c9b6ff', '#ff8fb8', '#9be7ff'][Math.floor(Math.random() * 6)], big ? 4.6 : 3 + Math.random() * 1.5, big ? 'star5' : 'star', 90, { vr: 7 });
          }
        }
      }
    }
    updateShine(dt);
    updateMagic(dt);
    updateHard(dt);
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
    if (monsterHit(p)) return true;
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
    spawnParticle(h.x, h.y, 0, 0, 0.6, '#ff5d8f', 10, 'ring', 0, { grow: 3.2, lw: 3 });
    spawnParticle(h.x, h.y - 10, 0, -50, 1.1, '#ff3d73', 13, 'text', 0, { text: '+1 ♥' });
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; spawnParticle(h.x, h.y, Math.cos(a) * 160, Math.sin(a) * 160, 0.7, '#ffd35a', 4, 'star5', 0, { drag: 0.94, vr: 6 }); }
    if (send) netSend({ t: 'heart', i });
  }
  function activateCp(i, send) {
    if (i <= G.cp) return;
    G.cp = i; Sfx.play('cp');
    const c = G.L.checkpoints[i];
    for (let k = 0; k < 10; k++) spawnParticle(c.x, c.y - 50, (Math.random() - 0.5) * 200, -Math.random() * 200, 0.8, '#ff8fb1', 4, 'heart', 300);
    spawnParticle(c.x, c.y - 30, 0, 0, 0.7, '#ffd35a', 14, 'ring', 0, { grow: 3, lw: 3 });
    for (let k = 0; k < 12; k++) spawnParticle(c.x, c.y - 50, (Math.random() - 0.5) * 240, -80 - Math.random() * 220, 1.1, RAINBOW[k % 6], 4 + Math.random() * 3, 'star5', 350, { vr: 5 });
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
    const celeb = CELEBS[(G.L.n - 1) % CELEBS.length];
    startCelebration(celeb);
    const res = { n: G.L.n, hearts: G.L.hearts.filter(h => h.taken).length, total: G.L.hearts.length, time: G.time, deaths: G.deaths, celeb };
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
    p.emote = trList('emotes', k); p.emoteT = 2.2; Sfx.play('pop');
    if (k === 0) for (let i = 0; i < 5; i++) spawnParticle(p.x + PW / 2, p.y, (Math.random() - 0.5) * 80, -80 - Math.random() * 80, 1, '#ff5d8f', 6, 'heart', -50);
    if (send && G.mode === 'online') netSend({ t: 'emote', k });
  }

  // ---------- fun actions: dance & strawberry matcha ----------
  function canAct(p) { return p.grounded && !p.anchored && Math.abs(p.vx) < 60 && G.respawnT <= 0; }
  function startAct(ch, kind, send, force) {
    const p = G.players && G.players[ch]; if (!p || !['dance', 'matcha', 'eat', 'orange'].includes(kind)) return false;
    if (!force && (G.state !== 'play' || !canAct(p))) return false;
    p.act = kind; p.actT = 0; p.actFx = 0; p.sipped = false; p.idleT = Math.min(p.idleT, 0);
    p.actDur = kind === 'dance' ? 4.6 : kind === 'eat' ? 5.4 : 4.4; p.chewT = 0;
    if (kind === 'matcha') { p.emote = tr('act.matcha'); p.emoteT = p.actDur; Sfx.play('pop'); }
    else if (kind === 'eat') { p.emote = tr('act.eat'); p.emoteT = p.actDur; Sfx.play('pop'); }
    else if (kind === 'orange') { p.actDur = 5.6; p.emote = tr('act.orange'); p.emoteT = p.actDur; Sfx.play('pop'); }
    else {
      Sfx.play('dance');
      for (let i = 0; i < 8; i++) spawnParticle(p.x + PW / 2, p.y + PH / 2, (Math.random() - 0.5) * 200, -60 - Math.random() * 120, 0.9, RAINBOW[i % 6], 3 + Math.random() * 2, 'star5', 200, { vr: 6 });
    }
    if (send) netSend({ t: 'act', a: kind });
    return true;
  }
  function stopAct(p) {
    if (p.act && p.emote === tr('act.' + p.act)) p.emoteT = Math.min(p.emoteT, 0.3);
    p.act = null;
  }
  function sipPhase(t) {
    const ph = (t % 1.8) / 1.8;
    const k = ph < 0.25 ? 0 : ph < 0.4 ? (ph - 0.25) / 0.15 : ph < 0.75 ? 1 : ph < 0.9 ? 1 - (ph - 0.75) / 0.15 : 0;
    return k * k * (3 - 2 * k);
  }
  function updateAct(p, dt) {
    if (!p.act) return;
    p.actT += dt;
    const moving = p.local ? (Math.abs(p.vx) > 60 || !p.grounded || p.anchored) : (Math.abs(p.nvx) > 60 || p.anchored);
    if (p.actT > p.actDur || moving || G.respawnT > 0) { stopAct(p); return; }
    const cx = p.x + PW / 2;
    if (p.act === 'dance') {
      p.actFx -= dt;
      if (p.actFx <= 0) {
        p.actFx = 0.3;
        spawnParticle(cx + (Math.random() - 0.5) * 24, p.y - 8, (Math.random() - 0.5) * 50, -55 - Math.random() * 30, 1.3, RAINBOW[Math.floor(Math.random() * 6)], 11 + Math.random() * 4, 'note', -15, { ch: Math.random() < 0.5 ? '♪' : '♫' });
        if (Math.random() < 0.5) spawnParticle(cx + (Math.random() - 0.5) * 30, p.y + PH - 2, (Math.random() - 0.5) * 60, -30, 0.6, '#fff4a8', 3, 'star', 0);
      }
    } else if (p.act === 'orange') {
      const k = sipPhase(p.actT);
      p.chewT = Math.max(0, p.chewT - dt);
      if (k > 0.9 && !p.sipped) {
        p.sipped = true; p.chewT = 0.8; Sfx.play('chomp');
        for (let i = 0; i < 6; i++) spawnParticle(cx + p.face * 6, p.y + 4, (Math.random() - 0.5) * 90, -40 - Math.random() * 70, 0.7, i % 2 ? '#ffb02e' : '#ffd36b', 2 + Math.random() * 1.5, 'dot', 500);
        if (Math.random() < 0.7) spawnParticle(cx + p.face * 8, p.y - 6, p.face * 20, -45, 1.1, '#ff9a1f', 5, 'heart', -20);
      } else if (k < 0.1) p.sipped = false;
    } else if (p.act === 'eat') {
      const k = sipPhase(p.actT);
      p.chewT = Math.max(0, p.chewT - dt);
      if (k > 0.9 && !p.sipped) {
        p.sipped = true; p.chewT = 0.9; Sfx.play('chomp');
        for (let i = 0; i < 4; i++) spawnParticle(cx + p.face * 5, p.y + 4, (Math.random() - 0.5) * 50, -20 - Math.random() * 40, 0.6, i % 2 ? '#c8783f' : '#e9c27a', 2 + Math.random(), 'dot', 300);
        if (Math.random() < 0.6) spawnParticle(cx + p.face * 8, p.y - 6, p.face * 20, -45, 1.1, '#ff5d8f', 5, 'heart', -20);
      } else if (k < 0.1) p.sipped = false;
      p.actFx -= dt;
      if (p.actFx <= 0) { p.actFx = 0.22; spawnParticle(cx + p.face * (6 + Math.random() * 8), p.y + PH - 16, (Math.random() - 0.5) * 8, -22 - Math.random() * 10, 1.3, 'rgba(255,255,255,0.75)', 2.4 + Math.random() * 1.5, 'dot', -8, { sway: 10, ph: Math.random() * 6 }); }
    } else {
      const k = sipPhase(p.actT);
      if (k > 0.9 && !p.sipped) {
        p.sipped = true; Sfx.play('sip');
        for (let i = 0; i < 3; i++) spawnParticle(cx + p.face * 6, p.y + 2, (Math.random() - 0.5) * 40, -40 - Math.random() * 40, 1, i % 2 ? '#ff8fb1' : '#9ad27f', 4, 'heart', -20);
      } else if (k < 0.1) p.sipped = false;
    }
  }

  // ---------- she lights up his face ----------
  const SHINE_DUR = 4.2;
  function startShine(ch, send) {
    if (ch !== 'girl' || !G.players) return false;
    const g = G.players.girl, b = G.players.boy;
    if (g.shineT > 0.6) return false;
    g.shineT = SHINE_DUR; b.glowT = SHINE_DUR;
    g.emote = tr('act.shine'); g.emoteT = 2.6;
    Sfx.play('shine');
    if (send) netSend({ t: 'shine' });
    return true;
  }
  function shineEnv(g) { return g.shineT > 0 ? Math.min(1, (SHINE_DUR - g.shineT) * 4, g.shineT * 2) : 0; }
  function wandTip(g) { return { x: g.x + PW / 2 + g.face * 15, y: g.y + PH - 32 }; }
  function faceOf(b) { return { x: b.x + PW / 2 + b.face * 2, y: b.y + PH - 30 }; }
  function updateShine(dt) {
    const g = G.players.girl, b = G.players.boy;
    if (g.shineT <= 0) { b.glowT = 0; return; }
    g.shineT = Math.max(0, g.shineT - dt); b.glowT = g.shineT;
    if (g.local && Math.abs(g.vx) < 30) g.face = b.x >= g.x ? 1 : -1;
    const s = wandTip(g), f = faceOf(b), e = shineEnv(g);
    if (Math.random() < dt * 26 * e) {
      const u = Math.random();
      spawnParticle(s.x + (f.x - s.x) * u, s.y + (f.y - s.y) * u - Math.sin(u * Math.PI) * 14, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, 0.7, Math.random() < 0.5 ? '#fff6b0' : '#ffffff', 2.5 + Math.random() * 2, 'star', 0);
    }
    if (Math.random() < dt * 16 * e) {
      const a = Math.random() * Math.PI * 2, r = 12 + Math.random() * 10;
      spawnParticle(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, Math.cos(a) * 30, Math.sin(a) * 30 - 20, 0.9, ['#ffe066', '#fff', '#ffb3d1', '#ffd36b'][Math.floor(Math.random() * 4)], 2.5 + Math.random() * 2.5, 'star5', 0, { vr: 6 });
    }
  }
  // the beam, his glowing face and the halo of rays (world space)
  function drawShine(ctx, g, b, t, front) {
    const e = shineEnv(g); if (e <= 0) return;
    const s = wandTip(g), f = faceOf(b);
    ctx.save();
    if (!front) {
      // halo behind his head: soft glow + slowly turning golden rays
      const pulse = 1 + Math.sin(t * 7) * 0.08;
      const gr = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, 34 * pulse);
      gr.addColorStop(0, `rgba(255,250,215,${0.95 * e})`); gr.addColorStop(0.5, `rgba(255,224,130,${0.5 * e})`); gr.addColorStop(1, 'rgba(255,210,120,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, 34 * pulse, 0, 7); ctx.fill();
      ctx.translate(f.x, f.y);
      ctx.rotate(t * 0.9);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2, L = (34 + Math.sin(t * 5 + i * 1.7) * 6) * e;
        ctx.fillStyle = i % 2 ? `rgba(255,205,80,${0.45 * e})` : `rgba(255,170,200,${0.35 * e})`;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); ctx.lineTo(Math.cos(a - 0.09) * L, Math.sin(a - 0.09) * L); ctx.lineTo(Math.cos(a + 0.09) * L, Math.sin(a + 0.09) * L); ctx.closePath(); ctx.fill();
      }
      ctx.restore(); return;
    }
    ctx.globalCompositeOperation = 'lighter';
    const dd = Math.hypot(f.x - s.x, f.y - s.y) || 1, ex = f.x - (f.x - s.x) / dd * 9, ey = f.y - (f.y - s.y) / dd * 9;
    const mx = (s.x + ex) / 2, my = (s.y + ey) / 2 - 14;
    const path = () => { ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(mx, my, ex, ey); };
    ctx.lineCap = 'round';
    path(); ctx.strokeStyle = `rgba(255,200,90,${0.16 * e})`; ctx.lineWidth = 12; ctx.stroke();
    path(); ctx.strokeStyle = `rgba(255,236,160,${0.45 * e})`; ctx.lineWidth = 4.5; ctx.stroke();
    path(); ctx.strokeStyle = `rgba(255,255,255,${0.9 * e})`; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.setLineDash([1.5, 7]); ctx.lineDashOffset = -t * 45;
    path(); ctx.strokeStyle = `rgba(255,255,255,${e})`; ctx.lineWidth = 3; ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'source-over';
    let gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 13);
    gr.addColorStop(0, `rgba(255,248,200,${0.28 * e})`); gr.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, 13, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 12);
    gr.addColorStop(0, `rgba(255,255,230,${e})`); gr.addColorStop(1, 'rgba(255,220,120,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(s.x, s.y, 12, 0, 7); ctx.fill();
    ctx.restore();
  }

  // ---------- magic: she turns him into a tangerine & a potato, he dresses her as a bride ----------
  const MORPH_DUR = 9, BRIDE_DUR = 10;
  function doMagic(ch, send) {
    if (!G.players || G.state === 'menu') return false;
    const g = G.players.girl, b = G.players.boy;
    if (ch === 'girl') {
      b.morphT = MORPH_DUR; g.castT = 0.9;
      g.emote = tr('act.morph'); g.emoteT = 3.6;
      Sfx.play('magic');
    } else {
      g.bridalT = BRIDE_DUR;
      b.emote = tr('act.bride'); b.emoteT = 3.8;
      Sfx.play('wedding');
      const cx = g.x + PW / 2, cy = g.y + PH / 2;
      for (let i = 0; i < 18; i++) spawnParticle(cx, cy, (Math.random() - 0.5) * 220, -60 - Math.random() * 200, 1.3, ['#ffffff', '#ffd1e3', '#ff8fb8', '#fff3c4'][i % 4], 3 + Math.random() * 3, i % 3 ? 'heart' : 'star5', 160, { vr: 4 });
      spawnParticle(cx, cy, 0, 0, 0.7, '#ffffff', 10, 'ring', 0, { grow: 3.4, lw: 3 });
    }
    if (send) netSend({ t: 'magic', ch });
    return true;
  }
  // ---------- her wardrobe: pink dress, sundress, ball gown, wedding gown ----------
  const OUTFITS = 4;
  function cycleOutfit(ch, send, to) {
    if (ch !== 'girl' || !G.players) return false;
    const g = G.players.girl;
    g.outfit = to !== undefined ? ((to % OUTFITS) + OUTFITS) % OUTFITS : (g.outfit + 1) % OUTFITS;
    if (g.local) G.savedOutfit = g.outfit;
    g.emote = tr('act.outfit' + g.outfit); g.emoteT = 2.2;
    g.act = null;
    Sfx.play(g.outfit === 3 ? 'wedding' : 'magic');
    const cx = g.x + PW / 2, cy = g.y + PH / 2;
    const cols = [['#ff7aa8', '#ffd0e2'], ['#ffd24d', '#fff3b0'], ['#b79cff', '#9be7ff'], ['#ffffff', '#ffd6e7']][g.outfit];
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; spawnParticle(cx, cy, Math.cos(a) * 140, Math.sin(a) * 140 - 30, 0.8, cols[i % 2], 3 + Math.random() * 2.5, i % 3 ? 'star5' : 'heart', 80, { drag: 0.93, vr: 6 }); }
    spawnParticle(cx, cy, 0, 0, 0.6, cols[0], 10, 'ring', 0, { grow: 3.4, lw: 3 });
    if (send) netSend({ t: 'outfit', o: g.outfit });
    return true;
  }
  function morphPoof(p) {
    const cx = p.x + PW / 2, cy = p.y + PH / 2;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; spawnParticle(cx, cy, Math.cos(a) * 120, Math.sin(a) * 120, 0.6, 'rgba(255,255,255,0.9)', 5 + Math.random() * 4, 'dot', 0, { drag: 0.9 }); }
    for (let i = 0; i < 8; i++) spawnParticle(cx, cy, (Math.random() - 0.5) * 200, -60 - Math.random() * 140, 0.9, ['#ff9a1f', '#c48a4a', '#ffd36b', '#ff8fb8'][i % 4], 3.5, 'star5', 250, { vr: 6 });
    Sfx.play('morph');
  }
  function updateMagic(dt) {
    G.players.boy.groom = G.players.girl.bridalT > 0 || G.players.girl.outfit === 3;
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      p.castT = Math.max(0, p.castT - dt);
      p.superT = Math.max(0, p.superT - dt);
      p.punchT = Math.max(0, p.punchT - dt);
      p.superCd = Math.max(0, p.superCd - dt);
      if (p.bridalT > 0) {
        p.bridalT = Math.max(0, p.bridalT - dt);
        if (Math.random() < dt * 3) spawnParticle(p.x + PW / 2 + (Math.random() - 0.5) * 26, p.y - 4, (Math.random() - 0.5) * 20, -30, 1.4, Math.random() < 0.5 ? '#ffffff' : '#ffc2d8', 3.5, Math.random() < 0.5 ? 'heart' : 'star', -10);
      }
      if (p.morphT > 0 || p.morphForm) {
        p.morphT = Math.max(0, p.morphT - dt);
        const form = p.morphT <= 0 ? null : p.morphT > MORPH_DUR / 2 ? 'tangerine' : 'potato';
        if (form !== p.morphForm) { p.morphForm = form; morphPoof(p); }
      }
    }
  }
  // ---------- HARD / NIGHTMARE: monsters, super powers, blackouts, explosions ----------
  const isAuth = () => G.mode !== 'online' || !G.net || G.net.role === 'host';
  const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
  function initHard() {
    const L = G.L;
    G.mon = (L.monsters || []).map(m => ({ id: m.id, type: m.type, hx: m.x, hy: m.y, x: m.x, y: m.y, vx: 0, vy: 0, face: 1, alive: true, dying: 0, die: null, dieDelay: 0, active: false, grounded: true, t: Math.random() * 5, hopT: 1 + Math.random() * 2, tx: m.x, ty: m.y, look: 0 }));
    G.holes = new Map(); G.bombs = [];
    G.threat = 0; G.shake = 0; G.relief = 0; G.hbT = 0; G.monGrace = 1.5; G.monNet = 0;
    G.boT = 0; G.boTotal = 0; G.boK = 0; G.boWas = false;
    const cfg = L.hard;
    G.boNext = cfg && cfg.bo ? rnd(cfg.bo) * 0.7 : 1e9;
    G.boomNext = cfg && cfg.boom ? rnd(cfg.boom) * 0.6 : 1e9;
  }
  function resetMonsters() {
    for (const m of G.mon) if (m.alive) { m.x = m.hx; m.y = m.hy; m.vx = m.vy = 0; m.active = false; }
    G.monGrace = 2.2; G.bombs = []; G.holes.clear();
  }
  function monSolid(x0, y0, x1, y1) {
    for (let ty = Math.floor(y0 / T); ty <= Math.floor(y1 / T); ty++) for (let tx = Math.floor(x0 / T); tx <= Math.floor(x1 / T); tx++) {
      const c = tileAt(tx, ty);
      if (c !== '.' && c !== '=' && c !== 'U' && c !== '^' && c !== 'v' && c !== '~' && solidAt(tx, ty, null)) return true;
    }
    return false;
  }
  function nearestPlayer(x, y) {
    let best = null, bd = 1e9;
    for (const ch of ['boy', 'girl']) { const p = G.players[ch], d = Math.hypot(p.x + PW / 2 - x, p.y + PH / 2 - y); if (d < bd) { bd = d; best = p; } }
    return { p: best, d: bd };
  }
  function monCenter(m) { return m.type === 'blob' ? { x: m.x, y: m.y - 11 } : { x: m.x, y: m.y }; }
  function updateMonsters(dt) {
    const cfg = G.L.hard, spd = cfg ? cfg.spd : 1, auth = isAuth();
    G.monGrace = Math.max(0, G.monGrace - dt);
    for (const m of G.mon) {
      m.t += dt;
      if (m.dying > 0) {
        if (m.dieDelay > 0) { m.dieDelay -= dt; if (m.dieDelay <= 0) beginDeath(m); continue; }
        m.dying -= dt;
        if (m.die === 'melt' && Math.random() < dt * 20) { const c = monCenter(m); spawnParticle(c.x + (Math.random() - 0.5) * 24, m.y - 2, (Math.random() - 0.5) * 30, 10 + Math.random() * 20, 0.8, monColor(m), 2 + Math.random() * 2, 'dot', 200); }
        if (m.dying <= 0) {
          m.alive = false;
          if (m.die === 'melt') { const c = monCenter(m); for (let i = 0; i < 10; i++) spawnParticle(c.x, m.y - 4, (Math.random() - 0.5) * 160, -40 - Math.random() * 120, 1, ['#ffe066', '#ff8fb8', '#c9b6ff', '#fff'][i % 4], 3 + Math.random() * 2, i % 2 ? 'star5' : 'heart', 150, { vr: 6 }); }
        }
        continue;
      }
      if (!m.alive) continue;
      const c = monCenter(m), np = nearestPlayer(c.x, c.y), tp = np.p;
      const tx = tp.x + PW / 2, ty = tp.y + PH / 2;
      m.look = clamp((tx - c.x) / 60, -1, 1);
      if (!auth) {
        // guest: glide toward the host's positions
        const k = Math.min(1, dt * 12); m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k;
        continue;
      }
      const wake = m.type === 'blob' ? 11 * T : 10 * T;
      if (!m.active && np.d < wake && G.monGrace <= 0 && G.respawnT <= 0) { m.active = true; if (Math.random() < 0.6) Sfx.play('growl'); }
      if (m.active && np.d > 19 * T) m.active = false;
      const frozen = G.monGrace > 0 || G.respawnT > 0 || G.state !== 'play' || G.introT > 0;
      if (m.type === 'blob') {
        m.vy = Math.min(900, m.vy + 2100 * dt);
        let want = 0;
        if (m.active && !frozen && Math.abs(tx - m.x) > 6) want = Math.sign(tx - m.x) * 78 * spd;
        else if (!m.active) want = Math.sin(m.t * 0.7 + m.id) * 22;
        if (m.grounded && want) {
          // don't walk off ledges (they hop up walls, but never jump into the void)
          const fx = m.x + Math.sign(want) * 14;
          if (!monSolid(fx, m.y + 2, fx, m.y + 6) && !(ty > m.y + T)) want = 0;
        }
        if (want) m.face = Math.sign(want);
        m.vx = approach(m.vx, want, 900 * dt);
        const nx = m.x + m.vx * dt;
        if (monSolid(nx - 11, m.y - 20, nx + 11, m.y - 2)) { if (m.grounded && m.active && !frozen) { m.vy = -600; m.grounded = false; } m.vx = 0; }
        else m.x = nx;
        if (m.active && !frozen && m.grounded) { m.hopT -= dt; if (m.hopT <= 0) { m.hopT = 0.9 + Math.random() * 1.4; m.vy = -330; m.grounded = false; } }
        const ny = m.y + m.vy * dt;
        if (m.vy > 0 && monSolid(m.x - 10, ny - 1, m.x + 10, ny)) { m.y = Math.floor(ny / T) * T; if (!m.grounded) m.squash = 0.25; m.vy = 0; m.grounded = true; }
        else if (m.vy < 0 && monSolid(m.x - 10, ny - 22, m.x + 10, ny - 21)) { m.vy = 0; }
        else { m.y = ny; m.grounded = false; }
        const under = tileAt(Math.floor(m.x / T), Math.floor((m.y - 4) / T));
        if (under === '~' || under === '^' || m.y > G.L.H * T) killMonster(m, 'melt', 0, true);
      } else {
        const sp = (m.type === 'eye' ? 82 : 52) * spd;
        let vx = 0, vy = 0;
        if (m.active && !frozen) {
          const d = Math.hypot(tx - c.x, ty - c.y) || 1;
          let mul = 1;
          if (m.type === 'eye') { const ph = m.t % 2.6; mul = ph < 1.2 ? 0.55 : ph < 1.8 ? 2.1 : 0.9; }
          vx = (tx - c.x) / d * sp * mul; vy = (ty - c.y) / d * sp * mul + Math.sin(m.t * 3) * 14;
        } else if (!m.active) {
          vx = (m.hx - m.x) * 0.8 + Math.sin(m.t * 0.9 + m.id) * 14; vy = (m.hy - m.y) * 0.8 + Math.sin(m.t * 1.7) * 10;
        }
        m.vx = approach(m.vx, vx, 400 * dt); m.vy = approach(m.vy, vy, 400 * dt);
        m.x += m.vx * dt; m.y += m.vy * dt;
        if (Math.abs(m.vx) > 4) m.face = Math.sign(m.vx);
      }
      if (m.squash) m.squash *= Math.pow(0.001, dt);
    }
    // host → guest positions
    if (G.mode === 'online' && auth) {
      G.monNet += dt;
      if (G.monNet > 1 / 15 && G.mon.length) {
        G.monNet = 0;
        const d = [];
        for (const m of G.mon) d.push(m.alive && !m.dying ? Math.round(m.x) : -1, Math.round(m.y), m.face);
        netSend({ t: 'mon', d });
      }
    }
  }
  function monsterHit(p) {
    if (!G.mon || G.monGrace > 0) return false;
    for (const m of G.mon) {
      if (!m.alive || m.dying > 0) continue;
      const c = monCenter(m), r = m.type === 'eye' ? 9 : 10.5;
      const qx = clamp(c.x, p.x + 2, p.x + p.w - 2), qy = clamp(c.y, p.y + 2, p.y + p.h - 1);
      if (Math.hypot(c.x - qx, c.y - qy) < r) return true;
    }
    return false;
  }
  function monColor(m) { return m.type === 'blob' ? '#5b2d8e' : m.type === 'ghost' ? '#d9d2ff' : '#b8243c'; }
  function killMonster(m, kind, delay, quiet) {
    if (!m.alive || m.dying > 0) return false;
    m.die = kind; m.dying = 1; m.dieDelay = delay || 0; m.quiet = quiet;
    if (!m.dieDelay) beginDeath(m);
    return true;
  }
  function beginDeath(m) {
    const c = monCenter(m);
    G.relief = Math.max(G.relief, 0.55);
    if (m.die === 'melt') {
      m.dying = 1.3;
      if (!m.quiet) Sfx.play('melt');
      spawnParticle(c.x, c.y, 0, 0, 0.6, '#ffd6f5', 8, 'ring', 0, { grow: 3, lw: 2.5 });
    } else {
      m.dying = 0.001;
      Sfx.play('crunch');
      const col = monColor(m), dark = m.type === 'blob' ? '#2a1450' : m.type === 'ghost' ? '#9a8fd6' : '#5a0f1e';
      for (let i = 0; i < 16; i++) spawnParticle(c.x + (Math.random() - 0.5) * 16, c.y + (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 420, -120 - Math.random() * 320, 1.1 + Math.random() * 0.5, i % 3 ? col : dark, 3 + Math.random() * 4, 'shard', 900, { vr: (Math.random() - 0.5) * 18 });
      for (let i = 0; i < 2; i++) spawnParticle(c.x + (i ? 5 : -5), c.y - 4, (i ? 1 : -1) * (80 + Math.random() * 80), -200 - Math.random() * 100, 1.2, '#ffffff', 3, 'dot', 900);
      spawnParticle(c.x, c.y - 14, (Math.random() - 0.5) * 40, -70, 0.9, '#ffde3b', 17, 'text', 0, { text: ['POW!', 'BAM!', 'KAPOW!', 'BOOM!'][Math.floor(Math.random() * 4)] });
      spawnParticle(c.x, c.y, 0, 0, 0.4, '#fff3a0', 8, 'ring', 0, { grow: 4, lw: 3 });
    }
  }
  function sideBySide() {
    const a = G.players.boy, b = G.players.girl;
    return Math.abs(a.x - b.x) < 3.2 * T && Math.abs(a.y - b.y) < 1.6 * T;
  }
  const SUPER_R = 6.5 * T;
  function trySuper(ch, send) {
    if (!G.players || G.state !== 'play' || G.respawnT > 0) return false;
    const p = G.players[ch];
    if (p.superCd > 0) return false;
    if (!sideBySide()) { p.emote = tr('act.close'); p.emoteT = 1.6; Sfx.play('pop'); return false; }
    p.superCd = 1.1;
    const ids = [];
    const px = p.x + PW / 2, py = p.y + PH / 2;
    for (const m of G.mon || []) {
      if (!m.alive || m.dying > 0) continue;
      const c = monCenter(m);
      if (Math.hypot(c.x - px, c.y - py) < SUPER_R) ids.push(m.id);
    }
    applySuper(ch, ids);
    if (send) netSend({ t: 'super', ch, ids });
    return true;
  }
  function applySuper(ch, ids) {
    const p = G.players[ch], px = p.x + PW / 2, py = p.y + PH / 2;
    if (ch === 'girl') {
      p.superT = 1.6; Sfx.play('magic');
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; spawnParticle(px, py - 8, Math.cos(a) * 240, Math.sin(a) * 240, 0.9, RAINBOW[i % 6], 4, 'star5', 0, { drag: 0.93, vr: 6 }); }
      spawnParticle(px, py, 0, 0, 0.9, '#ff8fd8', 12, 'ring', 0, { grow: SUPER_R / 12 * 0.9, lw: 4 });
    } else {
      p.punchT = 0.55; Sfx.play('punch');
      const tgt = (G.mon || []).find(m => ids.includes(m.id));
      if (tgt) p.face = tgt.x >= p.x ? 1 : -1;
      G.shake = Math.max(G.shake, 0.5);
      spawnParticle(px + p.face * 18, py - 4, 0, 0, 0.45, '#fff3a0', 8, 'ring', 0, { grow: 5, lw: 4 });
      spawnParticle(px, py, 0, 0, 0.7, '#ffb347', 12, 'ring', 0, { grow: SUPER_R / 12 * 0.9, lw: 4 });
      spawnParticle(px + p.face * 20, py - 26, p.face * 30, -60, 0.8, '#ffde3b', 18, 'text', 0, { text: 'POW!' });
    }
    let n = 0;
    for (const m of G.mon || []) {
      if (!ids.includes(m.id)) continue;
      const c = monCenter(m), d = Math.hypot(c.x - px, c.y - py);
      if (killMonster(m, ch === 'girl' ? 'melt' : 'shatter', d / 700)) n++;
    }
    if (n) setTimeout(() => Sfx.play('love'), 450);
  }
  // power cuts
  function startBlackout(d, send) {
    G.boTotal = d + 0.9; G.boT = G.boTotal; G.boWas = true;
    Sfx.play('powerdown');
    if (send) netSend({ t: 'bo', d: Math.round(d * 100) / 100 });
  }
  function updateBlackout(dt) {
    const cfg = G.L.hard;
    if (cfg && cfg.bo && isAuth() && G.state === 'play' && G.introT <= 0 && G.respawnT <= 0) {
      G.boNext -= dt;
      if (G.boNext <= 0 && G.boT <= 0) { startBlackout(1.6 + Math.random() * 1.4 + (G.L.wi >= 20 ? 0.6 : 0), true); G.boNext = rnd(cfg.bo); }
    }
    if (G.boT > 0) {
      G.boT -= dt;
      const e = G.boTotal - G.boT;
      if (e < 0.5) G.boK = Math.sin(e * 47) > 0.1 ? 0.95 : 0.1 + e;
      else if (G.boT > 0.4) G.boK = 1;
      else G.boK = Math.sin(G.boT * 61) > 0 ? 0.85 : 0.2 + G.boT;
      if (G.boT <= 0) { G.boK = 0; Sfx.play('powerup'); }
    } else G.boK = 0;
  }
  // exploding ground
  function bombSpot() {
    const L = G.L;
    for (let tries = 0; tries < 14; tries++) {
      const p = G.players[Math.random() < 0.5 ? 'boy' : 'girl'];
      const dir = Math.abs(p.vx) > 30 ? Math.sign(p.vx) : (Math.random() < 0.5 ? -1 : 1);
      const tx = Math.floor((p.x + PW / 2) / T) + dir * (2 + Math.floor(Math.random() * 7));
      for (let ty = Math.floor(p.y / T) - 3; ty < Math.floor(p.y / T) + 7; ty++) {
        if (tileAt(tx, ty - 1) !== '.' || tileAt(tx, ty) !== '#') continue;
        let ok = true;
        for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = 0; dy <= 2; dy++) if (tileAt(tx + dx, ty + dy) !== '#' || G.holes.has((ty + dy) * L.W + tx + dx)) { ok = false; break; }
        const wx = (tx + 0.5) * T;
        if (ok) for (const c of L.checkpoints) if (Math.abs(c.x - wx) < 2.5 * T) ok = false;
        if (ok && L.goal && Math.abs(L.goal.x - wx) < 4 * T) ok = false;
        if (ok) for (const pl of L.plates) if (Math.abs(pl.x / T - tx) < 2.5 && Math.abs(pl.y / T - ty) < 3) ok = false;
        if (ok) for (const k in L.doorGroup) { const kx = k % L.W; if (Math.abs(kx - tx) < 3) ok = false; }
        if (ok) for (const b of G.bombs) if (Math.abs(b.tx - tx) < 4) ok = false;
        if (ok) return { tx, ty };
        break;
      }
    }
    return null;
  }
  function addBomb(tx, ty, send) {
    G.bombs.push({ tx, ty, t: 1.35, beep: 0 });
    if (send) netSend({ t: 'bomb', tx, ty });
  }
  function explode(b) {
    const L = G.L, cx = (b.tx + 0.5) * T, cy = b.ty * T;
    for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
      const x = b.tx + dx, y = b.ty + dy;
      if (tileAt(x, y) === '#') G.holes.set(y * L.W + x, G.t + 6 + Math.random() * 0.5);
    }
    Sfx.play('explode');
    G.shake = Math.max(G.shake, 0.7);
    for (let i = 0; i < 26; i++) spawnParticle(cx + (Math.random() - 0.5) * 60, cy + Math.random() * 30, (Math.random() - 0.5) * 420, -150 - Math.random() * 380, 1 + Math.random() * 0.5, i % 3 ? L.theme.ground : L.theme.groundDark, 4 + Math.random() * 5, 'rock', 900);
    for (let i = 0; i < 26; i++) spawnParticle(cx, cy - 4, (Math.random() - 0.5) * 360, -60 - Math.random() * 300, 0.5 + Math.random() * 0.4, ['#ffe066', '#ffb347', '#ff5b3b', '#ff8a3d'][i % 4], 5 + Math.random() * 6, 'dot', 100, { drag: 0.92 });
    for (let i = 0; i < 10; i++) spawnParticle(cx + (Math.random() - 0.5) * 50, cy - 10, (Math.random() - 0.5) * 60, -30 - Math.random() * 50, 1.6, 'rgba(70,60,70,0.55)', 9 + Math.random() * 8, 'dot', -15, { drag: 0.97 });
    spawnParticle(cx, cy, 0, 0, 0.5, '#fff1b0', 12, 'ring', 0, { grow: 6, lw: 5 });
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      if (!p.local) continue;
      if (Math.hypot(p.x + PW / 2 - cx, p.y + PH / 2 - cy) < 1.9 * T) { startRespawn(true); break; }
    }
    for (const m of G.mon) { const c = monCenter(m); if (m.alive && Math.hypot(c.x - cx, c.y - cy) < 2 * T) killMonster(m, 'shatter', 0); }
  }
  function updateBombs(dt) {
    const cfg = G.L.hard, L = G.L;
    if (cfg && cfg.boom && isAuth() && G.state === 'play' && G.introT <= 0 && G.respawnT <= 0) {
      G.boomNext -= dt;
      if (G.boomNext <= 0) { G.boomNext = rnd(cfg.boom); const b = bombSpot(); if (b) addBomb(b.tx, b.ty, true); }
    }
    for (let i = G.bombs.length - 1; i >= 0; i--) {
      const b = G.bombs[i];
      b.t -= dt; b.beep -= dt;
      if (b.beep <= 0) { b.beep = Math.max(0.09, b.t * 0.22); Sfx.play('beep'); }
      if (b.t <= 0) { G.bombs.splice(i, 1); explode(b); }
    }
    for (const [k, t] of G.holes) {
      if (G.t < t) continue;
      const tx = k % L.W, ty = Math.floor(k / L.W);
      let blocked = false;
      for (const ch of ['boy', 'girl']) { const p = G.players[ch]; if (overlapTile(p.x, p.y, p.w, p.h, tx, ty)) blocked = true; }
      if (!blocked) { G.holes.delete(k); spawnParticle(tx * T + 16, ty * T + 8, 0, -20, 0.5, 'rgba(255,255,255,0.6)', 6, 'dot', 0); }
    }
  }
  function updateHard(dt) {
    if (!G.mon) return;
    updateMonsters(dt);
    updateBlackout(dt);
    updateBombs(dt);
    let target = 0;
    for (const m of G.mon) {
      if (!m.alive || m.dying > 0) continue;
      const c = monCenter(m), d = nearestPlayer(c.x, c.y).d;
      target = Math.max(target, clamp((9 * T - d) / (7 * T), 0, 1));
    }
    G.threat += (target - G.threat) * Math.min(1, dt * (target > G.threat ? 2.2 : 1.4));
    G.shake = Math.max(0, G.shake - dt * 2.2);
    G.relief = Math.max(0, G.relief - dt * 1.4);
    G.hbT -= dt;
    if (G.threat > 0.3 && G.hbT <= 0 && G.state === 'play') { Sfx.play('heartbeat'); G.hbT = 1.15 - 0.55 * G.threat; }
  }

  // ---------- drawing: monsters & hard-mode world fx ----------
  function drawMonster(ctx, m, t) {
    if (!m.alive) return;
    if (m.dying > 0 && m.die === 'shatter' && m.dieDelay <= 0) return;
    const melt = m.dying > 0 && m.die === 'melt' && m.dieDelay <= 0 ? 1 - m.dying / 1.3 : 0;
    ctx.save();
    if (m.type === 'blob') {
      ctx.translate(m.x, m.y);
      const wob = Math.sin(t * 7 + m.id) * 0.07 + (m.squash || 0);
      let sx = 1 + wob, sy = 1 - wob;
      if (!m.grounded) { sx *= 0.9; sy *= 1.12; }
      sy *= 1 - melt * 0.85; sx *= 1 + melt * 1.1;
      ctx.globalAlpha = 1 - Math.max(0, melt - 0.6) * 2.2;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 0, 13 * sx, 3, 0, 0, 7); ctx.fill();
      ctx.scale(m.face * sx, sy);
      const g = ctx.createLinearGradient(0, -26, 0, 0);
      g.addColorStop(0, melt ? '#a77fe0' : '#7a43c2'); g.addColorStop(1, '#2e1258');
      ctx.fillStyle = g;
      // horns
      ctx.beginPath(); ctx.moveTo(-9, -17); ctx.lineTo(-12, -28); ctx.lineTo(-4, -20); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(9, -17); ctx.lineTo(12, -28); ctx.lineTo(4, -20); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-13, 0); ctx.bezierCurveTo(-15, -14, -9, -24, 0, -24); ctx.bezierCurveTo(9, -24, 15, -14, 13, 0);
      for (let i = 0; i < 4; i++) { const x = 13 - (i + 1) * 6.5, d = 2.5 + Math.sin(t * 4 + i + m.id) * 1.2; ctx.quadraticCurveTo(x + 3.2, d, x, 0); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(-5, -17, 3.5, 2, -0.5, 0, 7); ctx.fill();
      // eyes
      const lk = m.look * m.face * 1.4;
      ctx.fillStyle = '#e4ff6a';
      ctx.beginPath(); ctx.ellipse(-4.5, -12, 3.6, 4.2, 0, 0, 7); ctx.ellipse(5, -12, 3.6, 4.2, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a0830';
      if (melt > 0.2) { ctx.strokeStyle = '#1a0830'; ctx.lineWidth = 1.2; for (const ex of [-4.5, 5]) { ctx.beginPath(); ctx.moveTo(ex - 2, -14); ctx.lineTo(ex + 2, -10); ctx.moveTo(ex + 2, -14); ctx.lineTo(ex - 2, -10); ctx.stroke(); } }
      else { ctx.beginPath(); ctx.ellipse(-4.5 + lk, -11.5, 1.3, 2.6, 0, 0, 7); ctx.ellipse(5 + lk, -11.5, 1.3, 2.6, 0, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#1a0830'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-8.5, -17.5); ctx.lineTo(-2, -15.5); ctx.moveTo(9, -17.5); ctx.lineTo(2.5, -15.5); ctx.stroke();
      // toothy grin
      ctx.fillStyle = '#1a0830';
      ctx.beginPath(); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(0, -1 + Math.sin(t * 9 + m.id), 6.5, -6); ctx.quadraticCurveTo(0, -3.5, -6, -6); ctx.fill();
      ctx.fillStyle = '#fff';
      for (const x of [-3.5, 0, 3.5]) { ctx.beginPath(); ctx.moveTo(x - 1.2, -5.3); ctx.lineTo(x + 1.2, -5.3); ctx.lineTo(x, -3.3); ctx.closePath(); ctx.fill(); }
    } else if (m.type === 'ghost') {
      ctx.translate(m.x, m.y + Math.sin(t * 2.4 + m.id) * 2);
      ctx.globalAlpha = (0.88 - melt * 0.85);
      ctx.scale(m.face * (1 + melt * 0.6), 1 - melt * 0.6);
      const gl = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
      gl.addColorStop(0, 'rgba(200,190,255,0.35)'); gl.addColorStop(1, 'rgba(200,190,255,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.fill();
      const g = ctx.createLinearGradient(0, -14, 0, 14);
      g.addColorStop(0, '#f4f0ff'); g.addColorStop(1, '#a99be6');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, -3, 11.5, Math.PI, 0); ctx.lineTo(11.5, 9);
      for (let i = 0; i < 4; i++) { const x = 11.5 - (i + 1) * 5.75, w = Math.sin(t * 6 + i * 1.6 + m.id) * 2.5; ctx.quadraticCurveTo(x + 2.9, 15 + w, x, 9); }
      ctx.closePath(); ctx.fill();
      // little arms
      const wv = Math.sin(t * 5 + m.id) * 3;
      ctx.beginPath(); ctx.ellipse(-12, 1 + wv, 3, 2, -0.6, 0, 7); ctx.ellipse(12, 1 - wv, 3, 2, 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#16102a';
      ctx.beginPath(); ctx.ellipse(-4, -4, 2.6, 3.6, 0, 0, 7); ctx.ellipse(4.5, -4, 2.6, 3.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff3355'; const lk = m.look * m.face;
      ctx.beginPath(); ctx.arc(-4 + lk, -3.5, 1, 0, 7); ctx.arc(4.5 + lk, -3.5, 1, 0, 7); ctx.fill();
      ctx.fillStyle = '#16102a'; ctx.beginPath(); ctx.ellipse(0.5, 3.5, 2.4, 3 + Math.sin(t * 3 + m.id), 0, 0, 7); ctx.fill();
    } else {
      // flying eyeball with bat wings and tentacles
      ctx.translate(m.x, m.y + Math.sin(t * 3 + m.id) * 2);
      ctx.globalAlpha = 1 - melt;
      ctx.scale(1 + melt * 0.7, 1 - melt * 0.8);
      const fl = Math.sin(t * 16 + m.id) * 0.5;
      ctx.fillStyle = '#3a1640';
      for (const sd of [-1, 1]) {
        ctx.save(); ctx.scale(sd, 1); ctx.rotate(fl * 0.6);
        ctx.beginPath(); ctx.moveTo(7, -3); ctx.lineTo(22, -12); ctx.lineTo(20, -4); ctx.lineTo(25, -1); ctx.lineTo(19, 2); ctx.lineTo(20, 7); ctx.lineTo(8, 3); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = '#3a1640'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 4, 8); ctx.quadraticCurveTo(i * 5 + Math.sin(t * 6 + i) * 4, 14, i * 4 + Math.sin(t * 5 + i * 2) * 3, 19); ctx.stroke(); }
      ctx.fillStyle = '#fff5f0'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(220,40,60,0.7)'; ctx.lineWidth = 0.7;
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + 0.4; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.quadraticCurveTo(Math.cos(a + 0.3) * 7, Math.sin(a + 0.3) * 7, Math.cos(a) * 5, Math.sin(a) * 5); ctx.stroke(); }
      const np = nearestPlayer(m.x, m.y).p, ang = Math.atan2(np.y + PH / 2 - m.y, np.x + PW / 2 - m.x);
      const ix = Math.cos(ang) * 3.6, iy = Math.sin(ang) * 3.6;
      ctx.fillStyle = '#d4183a'; ctx.beginPath(); ctx.arc(ix, iy, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#12060c'; ctx.beginPath(); ctx.ellipse(ix, iy, 1.4, 3.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(ix - 1.8, iy - 2, 1.1, 0, 7); ctx.fill();
      const blink = (m.t % 3.4) > 3.25;
      if (blink) { ctx.fillStyle = '#3a1640'; ctx.beginPath(); ctx.arc(0, 0, 10.4, Math.PI, 0); ctx.fill(); }
    }
    ctx.restore();
  }
  // glowing eyes and blinking bombs drawn on top of darkness / blackouts
  function drawGlows(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of G.mon) {
      if (!m.alive || (m.dying > 0 && m.dieDelay <= 0)) continue;
      const c = monCenter(m);
      let pts;
      if (m.type === 'blob') pts = [[m.x - 4.5 * m.face, m.y - 12, '#d8ff5a'], [m.x + 5 * m.face, m.y - 12, '#d8ff5a']];
      else if (m.type === 'ghost') pts = [[m.x - 4 * m.face, c.y - 4, '#ff3355'], [m.x + 4.5 * m.face, c.y - 4, '#ff3355']];
      else pts = [[c.x, c.y, '#ff2244']];
      for (const [x, y, col] of pts) {
        const r = m.type === 'eye' ? 9 : 6, fl = 0.75 + Math.sin(t * 9 + m.id) * 0.25;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(0.35, col + 'aa'); g.addColorStop(1, col + '00');
        ctx.globalAlpha = fl; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const b of G.bombs) {
      const on = Math.sin(t * (12 + (1.35 - b.t) * 30)) > 0;
      if (!on) continue;
      const x = (b.tx + 0.5) * T, y = b.ty * T;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 2 * T);
      g.addColorStop(0, 'rgba(255,60,40,0.8)'); g.addColorStop(1, 'rgba(255,40,30,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 2 * T, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function drawHardWorld(ctx, t, back) {
    if (!G.mon) return;
    if (back) {
      // super-power link ring when they stand side by side
      if (G.L.hard && G.state === 'play' && sideBySide()) {
        const a = G.players.boy, b = G.players.girl, cx = (a.x + b.x) / 2 + PW / 2, cy = Math.max(a.y, b.y) + PH;
        const w = Math.abs(a.x - b.x) / 2 + 22, pu = 1 + Math.sin(t * 6) * 0.06;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,140,200,${0.55 + Math.sin(t * 6) * 0.2})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy - 1, w * pu, 5 * pu, 0, 0, 7); ctx.stroke();
        ctx.restore();
      }
      // girl's magic circle
      const g = G.players.girl;
      if (g.superT > 0) {
        const k = 1 - g.superT / 1.6, cx = g.x + PW / 2, cy = g.y + PH - 2;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const a = Math.min(1, g.superT * 2.5);
        ctx.translate(cx, cy); ctx.scale(1, 0.32);
        for (const [r, sp, col] of [[34, 1.6, '255,140,220'], [48, -1.1, '190,160,255'], [62, 0.8, '255,220,120']]) {
          ctx.save(); ctx.rotate(t * sp);
          ctx.strokeStyle = `rgba(${col},${0.8 * a})`; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(0, 0, r * (0.6 + k * 0.6), 0, 7); ctx.stroke();
          ctx.fillStyle = `rgba(${col},${a})`;
          for (let i = 0; i < 8; i++) { const an = i / 8 * Math.PI * 2; starPath(ctx, Math.cos(an) * r * (0.6 + k * 0.6), Math.sin(an) * r * (0.6 + k * 0.6), 4, an); ctx.fill(); }
          ctx.restore();
        }
        ctx.restore();
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const gr = ctx.createRadialGradient(cx, cy - 20, 0, cx, cy - 20, 70);
        gr.addColorStop(0, `rgba(255,170,230,${0.45 * a})`); gr.addColorStop(1, 'rgba(255,170,230,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, cy - 20, 70, 0, 7); ctx.fill();
        ctx.restore();
      }
      return;
    }
    for (const m of G.mon) drawMonster(ctx, m, t);
    for (const b of G.bombs) {
      const x = (b.tx + 0.5) * T, y = b.ty * T, on = Math.sin(t * (12 + (1.35 - b.t) * 30)) > 0;
      ctx.fillStyle = on ? 'rgba(255,40,30,0.55)' : 'rgba(255,120,60,0.18)';
      ctx.fillRect((b.tx - 1) * T, y, 3 * T, T * 0.55);
      ctx.strokeStyle = 'rgba(40,10,10,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - 30, y + 3); ctx.lineTo(x - 12, y + 9); ctx.lineTo(x - 4, y + 2); ctx.lineTo(x + 10, y + 10); ctx.lineTo(x + 28, y + 4); ctx.stroke();
      // the bomb
      const s = 1 + (on ? 0.08 : 0);
      ctx.fillStyle = '#26222e'; ctx.beginPath(); ctx.arc(x, y - 8, 7.5 * s, 0, 7); ctx.fill();
      ctx.fillStyle = '#4a4458'; ctx.fillRect(x - 2.5, y - 17, 5, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(x - 2.5, y - 10.5, 2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, y - 17); ctx.quadraticCurveTo(x + 4, y - 22, x + 7, y - 20); ctx.stroke();
      ctx.fillStyle = on ? '#fff3a0' : '#ff8a3d'; starPath(ctx, x + 7, y - 20, 3.2, t * 12); ctx.fill();
      ctx.fillStyle = '#ff3355'; ctx.font = '700 12px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x, y - 32 + Math.sin(t * 14) * 1.5);
    }
  }
  function drawThreat(ctx) {
    const a = G.threat || 0, t = G.t;
    if (a > 0.01) {
      ctx.fillStyle = `rgba(14,0,26,${0.42 * a})`; ctx.fillRect(0, 0, G.cw, G.ch);
      const pulse = 0.85 + Math.sin(t * (5 + a * 5)) * 0.15;
      const vg = ctx.createRadialGradient(G.cw / 2, G.ch / 2, G.ch * (0.42 - a * 0.2), G.cw / 2, G.ch / 2, G.ch * 0.9);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(90,0,24,${0.75 * a * pulse})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, G.cw, G.ch);
    }
    if (G.relief > 0) { ctx.fillStyle = `rgba(255,240,215,${0.3 * G.relief})`; ctx.fillRect(0, 0, G.cw, G.ch); }
  }

  // ---------- sweet words & chat ----------
  function sayText(ch, text, dur) {
    const p = G.players && G.players[ch]; if (!p) return;
    p.say = { text, age: 0, dur: dur || Math.min(8, 3.2 + text.length * 0.07) };
    p.emoteT = 0;
    const cx = p.x + PW / 2;
    for (let i = 0; i < 6; i++) spawnParticle(cx, p.y - 10, (Math.random() - 0.5) * 120, -60 - Math.random() * 90, 1.2, i % 2 ? '#ff5d8f' : '#ffc2d4', 4 + Math.random() * 3, 'heart', -10);
  }
  function sayPhrase(ch, i, send) {
    i = ((i % NPHRASES) + NPHRASES) % NPHRASES;
    sayText(ch, trList('phrases', i), 3.6);
    Sfx.play('love');
    if (send) netSend({ t: 'say', i });
  }
  function chatSay(ch, text, send) {
    text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!text) return;
    const p = G.players && G.players[ch]; if (p) p.typing = false;
    sayText(ch, text);
    Sfx.play('msg');
    if (send) netSend({ t: 'chat', text });
  }
  function setTyping(ch, on, send) {
    const p = G.players && G.players[ch]; if (!p) return;
    p.typing = !!on; p.typingT = on ? 6 : 0;
    if (send) netSend({ t: 'typing', on: on ? 1 : 0 });
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
    netSend({ t: 's', x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, vx: Math.round(p.vx), vy: Math.round(p.vy), f: p.face, a: p.anchored ? 1 : 0, w: p.wallSide, g: p.grounded ? 1 : 0, r: Math.round(p.reel), tt: G.t, lv: G.L.n, o: p.outfit | 0 });
  }
  function onNet(m) {
    if (!G.players || !G.L) return;
    const o = G.players[other(G.myChar)];
    switch (m.t) {
      case 's':
        if (m.lv !== G.L.n) return;
        if (G.respawnT > 0.3) return;
        if (m.o !== undefined && o.char === 'girl') o.outfit = m.o | 0;
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
      case 'act': startAct(other(G.myChar), m.a, false, true); break;
      case 'shine': startShine('girl', false); break;
      case 'outfit': cycleOutfit('girl', false, m.o | 0); break;
      case 'magic': doMagic(m.ch === 'girl' ? 'girl' : 'boy', false); break;
      case 'super': if (G.mon) applySuper(m.ch === 'girl' ? 'girl' : 'boy', Array.isArray(m.ids) ? m.ids : []); break;
      case 'bomb': if (G.bombs) addBomb(m.tx | 0, m.ty | 0, false); break;
      case 'bo': if (G.mon) startBlackout(+m.d || 2, false); break;
      case 'mon':
        if (G.mon && Array.isArray(m.d)) G.mon.forEach((mo, i) => {
          const x = m.d[i * 3]; if (x === undefined) return;
          if (x < 0) { if (mo.alive && !mo.dying) killMonster(mo, 'melt', 0, true); return; }
          mo.tx = x; mo.ty = m.d[i * 3 + 1]; mo.face = m.d[i * 3 + 2] || 1;
          if (Math.abs(mo.x - x) > 200) { mo.x = x; mo.y = mo.ty; }
        });
        break;
      case 'say': sayPhrase(other(G.myChar), m.i | 0, false); break;
      case 'chat': chatSay(other(G.myChar), m.text, false); break;
      case 'typing': setTyping(other(G.myChar), !!m.on, false); break;
      case 'win': if (typeof m.time === 'number') G.time = m.time; win(true); break;
    }
  }

  // =====================================================================
  //  Particles & ambience
  // =====================================================================
  function spawnParticle(x, y, vx, vy, life, color, size, type, g, ex) {
    if (G.particles.length > 600) return;
    const p = { x, y, vx, vy, life, max: life, color, size, type, g: g || 0, rot: Math.random() * 6 };
    if (ex) Object.assign(p, ex);
    G.particles.push(p);
  }
  function stepParticles(ps, dt, onDie) {
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { if (onDie) onDie(p); ps.splice(i, 1); continue; }
      if (p.seek) {
        const c = G.celeb, k = Math.min(1, dt * 5);
        const pulse = 1 + Math.sin((c ? c.t : 0) * 9) * 0.05;
        p.x += (p.cx + p.tx * pulse - p.x) * k; p.y += (p.cy + p.ty * pulse - p.y) * k;
        continue;
      }
      p.vy += p.g * dt;
      const dr = p.drag !== undefined ? Math.pow(p.drag, dt * 60) : 0.99;
      p.vx *= dr; if (p.drag !== undefined) p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.sway) p.x += Math.sin(p.life * 2.2 + (p.ph || 0)) * p.sway * dt;
      p.rot += dt * (p.vr !== undefined ? p.vr : 3);
    }
  }
  function updateParticles(dt) {
    stepParticles(G.particles, dt);
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
    drawBackgroundFun(ctx, th);
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
  //  Flying cuties in the background (chicks, cows, unicorns, pigs, bunnies)
  // =====================================================================
  const CRITTER_TYPES = ['chick', 'chick', 'chick', 'cow', 'cow', 'unicorn', 'unicorn', 'unicorn', 'pig', 'bunny', 'bunny'];
  function makeCritter(type, opts) {
    const W = G.cw, H = G.ch, o = opts || {};
    const dir = o.dir || (Math.random() < 0.5 ? 1 : -1);
    const base = H / 520;
    const size = { chick: 1.0, cow: 0.9, unicorn: 0.95, pig: 0.85, bunny: 0.9 }[type] || 1;
    const sc = o.s || base * size * (0.75 + Math.random() * 0.5);
    const speed = (type === 'bunny' ? 40 : type === 'unicorn' ? 150 : type === 'cow' ? 75 : type === 'pig' ? 95 : 110) * (0.8 + Math.random() * 0.4) * (H / 900);
    return {
      type, dir, s: sc, vx: dir * (o.speed || speed), x: o.x !== undefined ? o.x : (dir > 0 ? -60 * sc : W + 60 * sc),
      by: o.y !== undefined ? o.y : type === 'bunny' ? H * (0.6 + Math.random() * 0.3) : H * (0.08 + Math.random() * 0.45), vy: type === 'bunny' ? -H * 0.02 : 0,
      ph: Math.random() * 6.28, amp: (type === 'bunny' ? 6 : 14) * sc, trail: [], y: 0,
      rainbow: type === 'unicorn' || (type === 'cow' && Math.random() < 0.7), hearts: type === 'pig', fg: !!o.fg, t: 0,
    };
  }
  function spawnCritter() {
    const type = CRITTER_TYPES[Math.floor(Math.random() * CRITTER_TYPES.length)];
    if (type === 'chick' && Math.random() < 0.45) {
      const lead = makeCritter('chick'), n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const c = makeCritter('chick', { dir: lead.dir, y: lead.by + (i % 2 ? 1 : -1) * i * 9 * lead.s, s: lead.s * (0.8 + Math.random() * 0.3), speed: Math.abs(lead.vx) });
        c.x = lead.x - lead.dir * i * 30 * lead.s; c.ph = lead.ph + i * 0.7;
        G.critters.push(c);
      }
      return;
    }
    G.critters.push(makeCritter(type));
  }
  function updateCritterList(list, dt) {
    const W = G.cw, H = G.ch, d = G.dpr;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.t += dt; c.x += c.vx * dt; c.by += c.vy * dt;
      c.y = c.by + Math.sin(c.t * 2.2 + c.ph) * c.amp;
      if (c.rainbow) {
        const tx = c.x - c.dir * 15 * c.s, ty = c.y + 1 * c.s;
        const l = c.trail[c.trail.length - 1];
        if (!l || Math.hypot(l.x - tx, l.y - ty) > 3 * d) { c.trail.push({ x: tx, y: ty }); if (c.trail.length > (c.fg ? 90 : 60)) c.trail.shift(); }
      }
      if (c.hearts && Math.random() < dt * 3) {
        const h = { x: c.x - c.dir * 12 * c.s, y: c.y, vx: -c.dir * 20 * d, vy: -20 * d, life: 1.4, max: 1.4, color: '#ff8fb1', size: 4 * c.s, type: 'heart', g: 0, rot: 0 };
        (c.fg ? G.fx : (G.bgParts = G.bgParts || [])).push(h);
      }
      const m = 120 * c.s + (c.trail.length ? 300 * d : 0);
      if (c.x < -m || c.x > W + m || c.by < -H * 0.3) list.splice(i, 1);
    }
  }
  function updateBackground(dt) {
    G.bgT += dt;
    G.critterT -= dt;
    if (G.critterT <= 0) { G.critterT = 2.2 + Math.random() * 3.8; if (G.critters.length < 7) spawnCritter(); }
    updateCritterList(G.critters, dt);
    if (G.bgParts) stepParticles(G.bgParts, dt);
    if (!G.shoot && Math.random() < dt * 0.25) G.shoot = { x: Math.random() * G.cw * 0.8 + G.cw * 0.1, y: Math.random() * G.ch * 0.3, t: 0 };
    if (G.shoot) { G.shoot.t += dt; if (G.shoot.t > 0.9) G.shoot = null; }
  }

  function drawRainbowTrail(ctx, c) {
    const tr2 = c.trail, n = tr2.length; if (n < 2) return;
    const bw = 2.6 * c.s;
    ctx.lineCap = 'round';
    for (let j = 0; j < 6; j++) {
      const off = (j - 2.5) * bw;
      ctx.strokeStyle = RAINBOW[j]; ctx.lineWidth = bw + 0.6;
      for (let i = 0; i < n - 1; i++) {
        ctx.globalAlpha = (i / n) * 0.85;
        ctx.beginPath(); ctx.moveTo(tr2[i].x, tr2[i].y + off); ctx.lineTo(tr2[i + 1].x, tr2[i + 1].y + off); ctx.stroke();
      }
    }
    ctx.fillStyle = '#fff';
    for (let i = 4; i < n; i += 7) {
      const tw = Math.sin(G.bgT * 8 + i);
      if (tw < 0.2) continue;
      ctx.globalAlpha = (i / n) * tw;
      starPath(ctx, tr2[i].x, tr2[i].y + (i % 2 ? -1 : 1) * bw * 3.6, bw * 0.9, G.bgT * 2 + i); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawWing(ctx, x, y, w, h, ang, col) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = col || '#ffffff';
    ctx.beginPath(); ctx.ellipse(-w * 0.5, -h * 0.3, w, h, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,170,200,0.7)'; ctx.beginPath(); ctx.ellipse(-w * 1.1, -h * 0.75, w * 0.35, h * 0.45, -0.5, 0, 7); ctx.fill();
    ctx.restore();
  }
  function happyEye(ctx, x, y, r) { ctx.strokeStyle = '#2b2140'; ctx.lineWidth = r * 0.7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y + r * 0.3, r, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  function dotEye(ctx, x, y, r) { ctx.fillStyle = '#2b2140'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + r * 0.35, y - r * 0.35, r * 0.4, 0, 7); ctx.fill(); }
  function blush(ctx, x, y, r) { ctx.fillStyle = 'rgba(255,120,150,0.55)'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, 7); ctx.fill(); }

  function drawCritterBody(ctx, type, t) {
    const flap = Math.sin(t * 16);
    switch (type) {
      case 'chick': {
        ctx.strokeStyle = '#ff9f1c'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-2, 8); ctx.lineTo(-3, 12); ctx.moveTo(2, 8); ctx.lineTo(2, 12); ctx.stroke();
        ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.ellipse(0, 0, 11, 9.5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(7, -6, 7.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff3a0'; ctx.beginPath(); ctx.ellipse(-1, 3, 6, 4, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(6, -13); ctx.quadraticCurveTo(5, -17, 8, -17); ctx.moveTo(8, -13); ctx.quadraticCurveTo(9, -16, 11, -15); ctx.stroke();
        ctx.fillStyle = '#ff922b'; ctx.beginPath(); ctx.moveTo(13.5, -7); ctx.lineTo(18.5, -5); ctx.lineTo(13.5, -3); ctx.closePath(); ctx.fill();
        dotEye(ctx, 10, -8, 1.5); blush(ctx, 9, -3.5, 2);
        ctx.save(); ctx.translate(-2, -2); ctx.rotate(-0.3 + flap * 0.7);
        ctx.fillStyle = '#fcc419'; ctx.beginPath(); ctx.ellipse(-5, 0, 7, 3.6, 0, 0, 7); ctx.fill(); ctx.restore();
        break;
      }
      case 'cow': {
        drawWing(ctx, -3, -9, 7, 4, -0.4 + flap * 0.5);
        ctx.fillStyle = '#f1e9ef';
        for (let i = 0; i < 4; i++) { const lx = -11 + i * 6.5, sw = Math.sin(t * 6 + i) * 1.5; rr(ctx, lx + sw, 6, 3.6, 7, 1.6); ctx.fill(); }
        ctx.fillStyle = '#6b5d66'; for (let i = 0; i < 4; i++) { const lx = -11 + i * 6.5, sw = Math.sin(t * 6 + i) * 1.5; ctx.fillRect(lx + sw, 11.5, 3.6, 1.8); }
        ctx.strokeStyle = '#f1e9ef'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-16, -2); ctx.quadraticCurveTo(-22, 0 + Math.sin(t * 5) * 3, -21, 6); ctx.stroke();
        ctx.fillStyle = '#4a3f47'; ctx.beginPath(); ctx.arc(-21, 7, 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffffff'; rr(ctx, -17, -9, 31, 18, 9); ctx.fill();
        ctx.fillStyle = '#3d3540';
        ctx.beginPath(); ctx.ellipse(-8, -3, 5, 3.5, 0.4, 0, 7); ctx.ellipse(3, 3, 4, 3, -0.3, 0, 7); ctx.ellipse(-13, 4, 2.5, 2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffb3c7'; ctx.beginPath(); ctx.ellipse(-3, 8.5, 3.5, 2, 0, 0, 7); ctx.fill();
        // head
        ctx.fillStyle = '#ffffff'; rr(ctx, 9, -16, 14, 15, 6); ctx.fill();
        ctx.fillStyle = '#3d3540'; ctx.beginPath(); ctx.ellipse(12, -13, 3, 2.2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff0c2'; ctx.beginPath(); ctx.moveTo(11, -15); ctx.lineTo(9.5, -20); ctx.lineTo(13, -16); ctx.fill(); ctx.beginPath(); ctx.moveTo(19, -16); ctx.lineTo(21.5, -20.5); ctx.lineTo(21, -15); ctx.fill();
        ctx.fillStyle = '#f4d5df'; ctx.beginPath(); ctx.ellipse(8.5, -12, 3.5, 1.8, -0.4, 0, 7); ctx.fill();
        ctx.fillStyle = '#ffb3c7'; ctx.beginPath(); ctx.ellipse(18, -4.5, 6.5, 4.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#d9779a'; ctx.beginPath(); ctx.arc(16, -4.5, 0.9, 0, 7); ctx.arc(20, -4.5, 0.9, 0, 7); ctx.fill();
        dotEye(ctx, 17.5, -10.5, 1.4);
        ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.arc(10, 1, 2.2, 0, 7); ctx.fill();
        drawWing(ctx, 1, -9, 8, 4.5, -0.6 + flap * 0.6);
        break;
      }
      case 'unicorn': {
        const gal = t * 11;
        ctx.fillStyle = '#efe7ff';
        for (let i = 0; i < 4; i++) { ctx.save(); ctx.translate(-9 + i * 5.5, 5); ctx.rotate(Math.sin(gal + i * 1.4) * 0.5); rr(ctx, -1.6, 0, 3.4, 9, 1.6); ctx.fill(); ctx.fillStyle = '#c9a7ff'; ctx.fillRect(-1.6, 7.5, 3.4, 1.8); ctx.fillStyle = '#efe7ff'; ctx.restore(); }
        // tail
        const tc = ['#ff8fc7', '#c9a7ff', '#8fd8ff'];
        tc.forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-14, -2); ctx.quadraticCurveTo(-21, -6 + i * 3 + Math.sin(t * 7 + i) * 2, -25, 2 + i * 2.5); ctx.stroke(); });
        drawWing(ctx, -3, -7, 7, 4, -0.4 + flap * 0.5, '#fff7fd');
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(0, 0, 15, 9, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.moveTo(8, -5); ctx.quadraticCurveTo(11, -14, 14, -15); ctx.lineTo(18, -8); ctx.quadraticCurveTo(14, -4, 12, 3); ctx.fill();
        ctx.save(); ctx.translate(17, -13); ctx.rotate(0.35); ctx.beginPath(); ctx.ellipse(0, 0, 7.5, 5.5, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffd6ea'; ctx.beginPath(); ctx.ellipse(4.5, 1.5, 3.2, 3, 0, 0, 7); ctx.fill(); ctx.restore();
        // horn
        ctx.fillStyle = '#ffd43b'; ctx.beginPath(); ctx.moveTo(15, -18); ctx.lineTo(21, -29); ctx.lineTo(19, -17); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#f59f00'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(16, -20.5); ctx.lineTo(19.5, -20); ctx.moveTo(17.5, -23.5); ctx.lineTo(20, -23); ctx.stroke();
        // mane
        [['#ff8fc7', 12, -17], ['#c9a7ff', 9.5, -13], ['#8fd8ff', 8, -9], ['#ffe066', 13.5, -20]].forEach(([c, x, y]) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill(); });
        happyEye(ctx, 18, -14.5, 1.6); blush(ctx, 20, -11, 1.8);
        drawWing(ctx, 1, -7, 8, 4.5, -0.6 + flap * 0.6, '#fff7fd');
        break;
      }
      case 'pig': {
        drawWing(ctx, -2, -8, 6, 3.6, -0.4 + flap * 0.5);
        ctx.fillStyle = '#ff9fbf';
        for (let i = 0; i < 4; i++) rr(ctx, -9 + i * 5, 5, 3.4, 6 + Math.sin(t * 6 + i), 1.5), ctx.fill();
        ctx.strokeStyle = '#ff9fbf'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(-15, -2, 2.6, 0, Math.PI * 1.6); ctx.stroke();
        ctx.fillStyle = '#ffb8cf'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 9.5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(9, -3, 8, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff9fbf'; ctx.beginPath(); ctx.moveTo(4, -9); ctx.lineTo(5, -15); ctx.lineTo(9, -10); ctx.fill(); ctx.beginPath(); ctx.moveTo(10, -10); ctx.lineTo(13, -15); ctx.lineTo(14, -8); ctx.fill();
        ctx.fillStyle = '#ff8fb1'; ctx.beginPath(); ctx.ellipse(16.5, -1.5, 3.4, 3, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#d6577f'; ctx.beginPath(); ctx.arc(15.5, -1.5, 0.8, 0, 7); ctx.arc(17.6, -1.5, 0.8, 0, 7); ctx.fill();
        dotEye(ctx, 12, -6, 1.3); blush(ctx, 11, -1, 1.8);
        drawWing(ctx, 1, -8, 7, 4, -0.6 + flap * 0.6);
        break;
      }
      case 'bunny': {
        const bc = ['#ff6b9d', '#ffd43b', '#74c0fc'], bp = [[-9, -44], [0, -51], [9, -43]];
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.8;
        bp.forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(x + Math.sin(t * 2 + x) * 1.5, y + 8); ctx.stroke(); });
        bp.forEach(([x, y], i) => {
          const bx = x + Math.sin(t * 2 + x) * 1.5;
          ctx.fillStyle = bc[i]; ctx.beginPath(); ctx.ellipse(bx, y, 7, 8.5, 0, 0, 7); ctx.fill();
          ctx.beginPath(); ctx.moveTo(bx - 1.5, y + 8.5); ctx.lineTo(bx + 1.5, y + 8.5); ctx.lineTo(bx, y + 10.5); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(bx - 2.5, y - 3, 1.6, 2.6, -0.4, 0, 7); ctx.fill();
        });
        ctx.fillStyle = '#ffffff';
        ctx.save(); ctx.translate(-3, -26); ctx.rotate(-0.25 + Math.sin(t * 3) * 0.08); ctx.beginPath(); ctx.ellipse(0, -5, 2.6, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffc9da'; ctx.beginPath(); ctx.ellipse(0, -5, 1.2, 5, 0, 0, 7); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.save(); ctx.translate(3, -26); ctx.rotate(0.25 - Math.sin(t * 3) * 0.08); ctx.beginPath(); ctx.ellipse(0, -5, 2.6, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ffc9da'; ctx.beginPath(); ctx.ellipse(0, -5, 1.2, 5, 0, 0, 7); ctx.fill(); ctx.restore();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(0, -4, 7, 8, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(0, -17, 7.5, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-3, 4 + Math.sin(t * 4) * 1, 2.4, 3, 0, 0, 7); ctx.ellipse(3, 4 - Math.sin(t * 4) * 1, 2.4, 3, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(-5, -10, 2.2, 0, 7); ctx.arc(5, -10, 2.2, 0, 7); ctx.fill();
        dotEye(ctx, -2.6, -18, 1.3); dotEye(ctx, 2.6, -18, 1.3); blush(ctx, -4.5, -14.5, 1.7); blush(ctx, 4.5, -14.5, 1.7);
        ctx.fillStyle = '#ff8fb1'; ctx.beginPath(); ctx.arc(0, -15, 1, 0, 7); ctx.fill();
        break;
      }
    }
  }
  function drawCritterList(ctx, list) {
    for (const c of list) if (c.rainbow) drawRainbowTrail(ctx, c);
    for (const c of list) {
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.scale(c.s * (c.type === 'bunny' ? 1 : c.dir), c.s);
      if (c.type !== 'bunny') ctx.rotate(Math.cos(c.t * 2.2 + c.ph) * 0.12);
      drawCritterBody(ctx, c.type, c.t + c.ph);
      ctx.restore();
    }
  }
  function drawBackgroundFun(ctx, th) {
    const W = G.cw, H = G.ch, d = G.dpr;
    // a big soft rainbow that fades in and out now and then
    if (!th.cave && !th.dark) {
      const cyc = G.bgT % 40, a = cyc < 4 ? cyc / 4 : cyc < 16 ? 1 : cyc < 20 ? (20 - cyc) / 4 : 0;
      if (a > 0) {
        const cx = W * 0.32, cy = H * 0.95, R = H * 0.78, bw = H * 0.022;
        ctx.globalAlpha = a * 0.3; ctx.lineWidth = bw + 1;
        RAINBOW.forEach((c, i) => { ctx.strokeStyle = c; ctx.beginPath(); ctx.arc(cx, cy, R - i * bw, Math.PI, Math.PI * 2); ctx.stroke(); });
        ctx.globalAlpha = 1;
      }
    }
    // shooting star
    if (G.shoot) {
      const sh = G.shoot, k = sh.t / 0.9, len = 120 * d;
      const x = sh.x + k * 260 * d, y = sh.y + k * 120 * d;
      const g = ctx.createLinearGradient(x, y, x - len, y - len * 0.46);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalAlpha = Math.sin(k * Math.PI); ctx.strokeStyle = g; ctx.lineWidth = 2.5 * d; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y - len * 0.46); ctx.stroke();
      ctx.fillStyle = '#fff'; starPath(ctx, x, y, 5 * d, sh.t * 6); ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawCritterList(ctx, G.critters);
    if (G.bgParts) drawParticles(ctx, G.bgParts, d);
  }

  // =====================================================================
  //  Victory celebrations (screen space) — each stage gets a different one
  // =====================================================================
  function heartCurve(a) {
    return { x: 16 * Math.pow(Math.sin(a), 3) / 16, y: -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16 };
  }
  function fxp(o) { if (G.fx.length < 1100) G.fx.push(Object.assign({ vx: 0, vy: 0, g: 0, rot: Math.random() * 6, color: '#ff5d8f', size: 6, type: 'heart' }, o, { max: o.life })); }
  function startCelebration(kind) {
    G.celeb = { kind, t: 0, acc: 0, done: {} };
    G.fx = []; G.fxCritters = [];
  }
  function explodeHeart(x, y, scale, palette) {
    const d = G.dpr;
    for (let i = 0; i < 46; i++) {
      const a = i / 46 * Math.PI * 2, h = heartCurve(a), sp = scale * (0.9 + Math.random() * 0.2);
      fxp({ x, y, vx: h.x * sp, vy: h.y * sp, g: 60 * d, drag: 0.95, life: 1.3 + Math.random() * 0.5, color: palette[i % palette.length], size: (2.5 + Math.random() * 2) * d, type: i % 3 ? 'dot' : 'star5', vr: 4 });
    }
    fxp({ x, y, life: 0.6, color: palette[0], size: 10 * d, type: 'ring', grow: 6, lw: 3 });
    Sfx.play('boom');
  }
  function updateCelebration(dt) {
    const c = G.celeb; if (!c) { stepParticles(G.fx, dt); return; }
    const W = G.cw, H = G.ch, d = G.dpr, t = c.t;
    c.t += dt; c.acc += dt;
    const once = (k) => (c.done[k] ? false : (c.done[k] = true));
    const pink = ['#ff3d73', '#ff7aa8', '#ffb3c7', '#ffd1dc', '#ffffff'], gold = ['#ffd43b', '#fff3bf', '#ffa94d', '#ffffff'];
    const cx = W / 2, cy = H * 0.42;
    switch (c.kind) {
      case 'fireworks':
        if (t < 4.2 && c.acc > 0.38) {
          c.acc = 0;
          const pal = [pink, gold, RAINBOW, ['#b197fc', '#d0bfff', '#fff']][Math.floor(Math.random() * 4)];
          fxp({ x: W * (0.15 + Math.random() * 0.7), y: H + 10 * d, vy: -H * (0.95 + Math.random() * 0.35), g: H * 0.9, life: 0.85 + Math.random() * 0.2, color: pal[0], size: 3 * d, type: 'rocket', pal, scale: H * (0.55 + Math.random() * 0.25) });
          Sfx.play('whoosh');
        }
        break;
      case 'starRain':
        if (once('burst')) { for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2, sp = H * (0.3 + Math.random() * 0.3); fxp({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.94, life: 1.6, color: gold[i % 4], size: (6 + Math.random() * 6) * d, type: 'star5', vr: 5 }); } Sfx.play('sparkle'); }
        if (t < 4 && Math.random() < dt * 40) fxp({ x: Math.random() * W, y: -20 * d, vx: (Math.random() - 0.5) * 40 * d, vy: H * (0.25 + Math.random() * 0.35), life: 3.4, color: [...gold, '#ff8fb1', '#8fd8ff'][Math.floor(Math.random() * 6)], size: (5 + Math.random() * 10) * d, type: 'star5', vr: (Math.random() - 0.5) * 8 });
        break;
      case 'heartSpiral':
        if (t < 3.2) {
          for (let arm = 0; arm < 5; arm++) {
            if (Math.random() > dt * 30) continue;
            const a = t * 4.5 + arm / 5 * Math.PI * 2, sp = H * 0.32;
            fxp({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.985, life: 2, color: `hsl(${(t * 120 + arm * 72) % 360},90%,70%)`, size: (5 + Math.random() * 4) * d, type: 'heart' });
          }
        }
        if (once('ring')) { fxp({ x: cx, y: cy, life: 0.9, color: '#ff5d8f', size: 20 * d, type: 'ring', grow: 8, lw: 5 }); Sfx.play('love'); }
        break;
      case 'unicorn':
        if (once('u')) {
          const u = makeCritter('unicorn', { dir: 1, y: H * 0.32, s: H / 190, speed: W * 0.42, fg: true }); u.x = -40 * u.s; u.amp = 22 * d; G.fxCritters.push(u);
          Sfx.play('sparkle');
        }
        if (t > 0.9 && once('chicks')) for (let i = 0; i < 5; i++) { const ch = makeCritter('chick', { dir: -1, y: H * 0.62 + (i % 2 ? 14 : -14) * d, s: H / 300, speed: W * 0.32, fg: true }); ch.x = W + (40 + i * 45) * ch.s; ch.ph = i; G.fxCritters.push(ch); }
        if (t > 1.6 && once('cow')) { const cw = makeCritter('cow', { dir: 1, y: H * 0.18, s: H / 260, speed: W * 0.3, fg: true }); cw.rainbow = true; cw.x = -60 * cw.s; G.fxCritters.push(cw); }
        for (const u of G.fxCritters) if (u.type === 'unicorn' && Math.random() < dt * 30) fxp({ x: u.x - 14 * u.s, y: u.y, vx: (Math.random() - 0.5) * 60 * d, vy: 30 * d, g: 120 * d, life: 1.4, color: RAINBOW[Math.floor(Math.random() * 6)], size: (3 + Math.random() * 4) * d, type: 'star5', vr: 6 });
        break;
      case 'confetti':
        if (t < 1.4) for (let side = 0; side < 2; side++) for (let k = 0; k < 4; k++) {
          if (Math.random() > dt * 30) continue;
          const dir = side ? -1 : 1, a = -Math.PI / 2 + dir * (0.25 + Math.random() * 0.45), sp = H * (0.9 + Math.random() * 0.6);
          fxp({ x: side ? W : 0, y: H, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: H * 0.7, drag: 0.975, life: 3 + Math.random(), color: RAINBOW[Math.floor(Math.random() * 6)], size: (7 + Math.random() * 6) * d, type: Math.random() < 0.2 ? 'heart' : 'confetti', vr: (Math.random() - 0.5) * 14, sway: 40 * d, ph: Math.random() * 6 });
        }
        if (once('pop')) Sfx.play('boom');
        break;
      case 'bigHeart':
        if (once('make')) {
          const R = H * 0.26;
          for (let i = 0; i < 110; i++) {
            const a = i / 110 * Math.PI * 2, h = heartCurve(a), side = Math.floor(Math.random() * 4);
            const sx = side === 0 ? Math.random() * W : side === 1 ? W + 20 : side === 2 ? Math.random() * W : -20, sy = side === 0 ? -20 : side === 1 ? Math.random() * H : side === 2 ? H + 20 : Math.random() * H;
            fxp({ x: sx, y: sy, seek: true, cx, cy, tx: h.x * R, ty: h.y * R, life: 4.2, color: i % 2 ? '#ff3d73' : '#ff8fb1', size: (4 + Math.random() * 3) * d, type: i % 4 ? 'heart' : 'star5', vr: 3 });
          }
        }
        if (t > 2.3 && once('burst')) {
          for (const p of G.fx) if (p.seek) { p.seek = false; p.vx = p.tx * 3.2 + (Math.random() - 0.5) * 80 * d; p.vy = p.ty * 3.2 + (Math.random() - 0.5) * 80 * d; p.drag = 0.96; p.g = 80 * d; p.life = Math.min(p.life, 1.6); }
          fxp({ x: cx, y: cy, life: 0.8, color: '#ffffff', size: 30 * d, type: 'ring', grow: 6, lw: 6 });
          Sfx.play('love');
        }
        break;
      case 'balloons':
        if (t < 3 && Math.random() < dt * 9) fxp({ x: W * (0.05 + Math.random() * 0.9), y: H + 40 * d, vy: -H * (0.16 + Math.random() * 0.14), life: 7, color: ['#ff5d8f', '#ff8fb1', '#ffd43b', '#b197fc', '#74c0fc', '#ff6b6b'][Math.floor(Math.random() * 6)], size: (12 + Math.random() * 10) * d, type: 'balloon', sway: 30 * d, ph: Math.random() * 6, drag: 1 });
        if (t < 3 && Math.random() < dt * 12) fxp({ x: Math.random() * W, y: Math.random() * H * 0.6, life: 0.8, color: '#fff', size: 5 * d, type: 'star', vr: 2 });
        break;
    }
    stepParticles(G.fx, dt, (p) => { if (p.type === 'rocket') explodeHeart(p.x, p.y, p.scale, p.pal); });
    for (const p of G.fx) if (p.type === 'rocket' && Math.random() < 0.6) G.fx.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 30 * d, vy: 20 * d, g: 0, life: 0.4, max: 0.4, color: '#ffe8a3', size: 1.6 * d, type: 'dot', rot: 0 });
    updateCritterList(G.fxCritters, dt);
    if (c.t > 9 && !G.fx.length && !G.fxCritters.length) G.celeb = null;
  }
  function drawCelebration(ctx) {
    if (!G.fx.length && !G.fxCritters.length) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawCritterList(ctx, G.fxCritters);
    drawParticles(ctx, G.fx, G.dpr);
  }

  // =====================================================================
  //  Characters
  // =====================================================================
  function drawCharacter(ctx, p, t) {
    const C = LOOK[p.char], girl = p.char === 'girl';
    const moving = p.grounded && Math.abs(p.vx) > 20 && !p.anchored;
    const wt = p.walkT;
    const air = !p.grounded && !p.anchored;
    const dance = p.act === 'dance' && !p.anchored, sipping = p.act === 'matcha' && !p.anchored, eating = p.act === 'eat' && !p.anchored;
    const orange = p.act === 'orange' && !p.anchored;
    const db = (p.actT || 0) * 9, sk = sipping ? sipPhase(p.actT || 0) : 0, ek = eating || orange ? sipPhase(p.actT || 0) : 0;
    const wandUp = girl && !p.anchored && ((p.castT || 0) > 0 || (p.superT || 0) > 0);
    const shining = girl && (p.shineT > 0 || wandUp) && !dance && !sipping && !eating && !orange && !p.anchored;
    const glowing = !girl && p.glowT > 0;
    const chewing = (eating || orange) && (p.chewT > 0 || (ek > 0.9));
    const outfit = girl ? (p.outfit || 0) : 0;
    const bride = girl && ((p.bridalT || 0) > 0 || outfit === 3);
    const groom = !girl && !!p.groom;
    const punching = !girl && (p.punchT || 0) > 0;
    const busyHands = dance || sipping || eating || orange || shining || punching;
    ctx.save();
    ctx.translate(p.x + p.w / 2, p.y + p.h);
    if (dance) { ctx.translate(0, -Math.abs(Math.sin(db)) * 3); ctx.rotate(Math.sin(db) * 0.14); }
    if (p.anchored && p.wallSide) ctx.rotate(p.wallSide * 0.12);
    const kissing = G.kissT > 0 && G.players && G.players[p.char] === p;
    if (kissing) ctx.rotate(p.face * 0.22 * Math.min(1, G.kissT * 3, (1.4 - G.kissT) * 6));
    const sq = p.squash;
    ctx.scale(p.face * (1 + sq * 0.6), 1 - sq * 0.6);
    const crouch = p.anchored && !p.wallSide ? 3 : 0;
    const bob = moving ? Math.abs(Math.sin(wt)) * -1.5 : Math.sin(t * 2.2 + (girl ? 1 : 0)) * 0.4;
    if (!girl && p.morphForm) { drawMorph(ctx, p, t, moving, air, bob); ctx.restore(); return; }

    // anchor glow
    if (p.anchored) {
      ctx.fillStyle = 'rgba(255,214,102,0.35)';
      ctx.beginPath(); ctx.ellipse(0, -1, 14, 4, 0, 0, 7); ctx.fill();
    }
    // legs
    ctx.fillStyle = C.shoe;
    const la = moving ? Math.sin(wt) * 4 : dance ? Math.sin(db) * 3.5 : 0;
    if (air) { rr(ctx, -6, -9, 5, 6, 2); ctx.fill(); rr(ctx, 1, -7, 5, 6, 2); ctx.fill(); }
    else if (crouch) { rr(ctx, -9, -5, 6, 5, 2); ctx.fill(); rr(ctx, 3, -5, 6, 5, 2); ctx.fill(); }
    else { rr(ctx, -6 + la * 0.6, -6 - Math.max(0, la) * 0.3, 5, 6, 2); ctx.fill(); rr(ctx, 1 - la * 0.6, -6 - Math.max(0, -la) * 0.3, 5, 6, 2); ctx.fill(); }

    ctx.translate(0, crouch + bob);
    if (bride) {
      const sw = Math.sin(t * 2.6) * 2 - (moving ? 4 : 0) - (air ? 3 : 0);
      ctx.fillStyle = 'rgba(255,255,255,0.72)';
      ctx.beginPath(); ctx.moveTo(-4, -40); ctx.quadraticCurveTo(-16, -36, -19 + sw, -18); ctx.quadraticCurveTo(-21 + sw * 1.4, -6, -17 + sw * 1.6, 0); ctx.lineTo(-7, -2); ctx.quadraticCurveTo(-12, -20, -2, -34); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,235,0.9)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
    // back hair (girl)
    if (girl) {
      ctx.fillStyle = C.hair;
      rr(ctx, -12, -36, 20, 22, 8); ctx.fill();
      const sw = Math.sin(t * 3) * 1.5 - (air ? 2 : 0) - (moving ? 1.5 : 0) + (dance ? Math.sin(db) * 3.5 : 0);
      ctx.beginPath(); ctx.moveTo(-11, -30); ctx.quadraticCurveTo(-17 + sw, -22, -12 + sw, -12); ctx.lineTo(-6, -16); ctx.closePath(); ctx.fill();
    }
    // body
    ctx.fillStyle = C.body;
    if (bride) {
      // wedding gown: fitted bodice, wide flowing skirt with a scalloped lace hem
      const sway = Math.sin(t * 3) * 0.8 + (moving ? Math.sin(wt) * 1.2 : 0);
      const gg = ctx.createLinearGradient(0, -20, 0, 0);
      gg.addColorStop(0, '#ffffff'); gg.addColorStop(1, '#f3e8f4');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.moveTo(-5.5, -20); ctx.lineTo(5.5, -20); ctx.lineTo(5, -13); ctx.quadraticCurveTo(12, -6, 14 + sway, 0);
      for (let i = 0; i < 6; i++) { const x = 14 + sway - (i + 1) * (28 / 6); ctx.quadraticCurveTo(x + 2.3, 2.2, x, 0); }
      ctx.quadraticCurveTo(-12, -6, -5, -13); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ead7ec'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = '#ffd6e7'; ctx.fillRect(-5.5, -13.8, 11, 1.4);
      ctx.fillStyle = 'rgba(230,200,235,0.9)';
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-11.7 + sway * 0.5 + i * 4.7, -1.4, 0.7, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-4 + i * 4, -7 + (i % 2), 0.6, 0, 7); ctx.fill(); }
      ctx.save(); ctx.scale(p.face, 1);
      ctx.fillStyle = '#ff7aa8';
      ctx.beginPath(); ctx.arc(0, -17.4, 0.9, 0, 7); ctx.fill();
      rr(ctx, -0.8, -16, 1.6, 2.6, 0.7); ctx.fill();
      ctx.restore();
    } else if (girl && outfit === 1) {
      // sunny yellow sundress with white polka dots
      const sway = Math.sin(t * 3) * 0.6 + (moving ? Math.sin(wt) : 0);
      const gg = ctx.createLinearGradient(0, -20, 0, -3); gg.addColorStop(0, '#ffe066'); gg.addColorStop(1, '#ffc233');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.moveTo(-5.5, -19.5); ctx.lineTo(5.5, -19.5); ctx.lineTo(5, -13); ctx.quadraticCurveTo(11, -7, 12.5 + sway, -3); ctx.quadraticCurveTo(0, -1, -12.5 + sway, -3); ctx.quadraticCurveTo(-11, -7, -5, -13); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; for (const [dx, dy] of [[-6, -6], [-1, -8], [5, -5.5], [-3, -3.8], [8, -3.5], [2, -11.5], [-7.5, -4]]) { ctx.beginPath(); ctx.arc(dx, dy, 0.9, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-5.5, -20, 11, 1.8);
      ctx.fillStyle = '#ff8fb8'; ctx.fillRect(-5, -13.6, 10, 1.4);
      ctx.fillStyle = '#ff6fa3'; ctx.beginPath(); ctx.arc(0, -13, 1.4, 0, 7); ctx.fill();
    } else if (girl && outfit === 2) {
      // princess ball gown: lilac-to-blue gradient, big skirt with stars and a pink sash
      const sway = Math.sin(t * 2.6) * 1 + (moving ? Math.sin(wt) * 1.4 : 0);
      const gg = ctx.createLinearGradient(0, -20, 0, 0); gg.addColorStop(0, '#c9b6ff'); gg.addColorStop(0.55, '#a58cf0'); gg.addColorStop(1, '#7ec9ff');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.moveTo(-5.5, -20); ctx.lineTo(5.5, -20); ctx.lineTo(5, -13); ctx.quadraticCurveTo(12, -7, 14.5 + sway, -1);
      for (let i = 0; i < 5; i++) { const x = 14.5 + sway - (i + 1) * (29 / 5); ctx.quadraticCurveTo(x + 2.9, 1.8, x, -1); }
      ctx.quadraticCurveTo(-12, -7, -5, -13); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.6; ctx.stroke();
      ctx.fillStyle = '#ff8fd0'; ctx.fillRect(-5.5, -14.2, 11, 1.8);
      ctx.fillStyle = '#ffe9a8';
      for (const [dx, dy, r] of [[-8, -5, 1.5], [-2, -7.5, 1.1], [6, -4.5, 1.4], [0, -2.5, 1], [9, -8, 0.9], [-9.5, -9, 0.9]]) { starPath(ctx, dx, dy, r * 1.6, t * 0.6 + dx); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(-5, -9.5, 1.2, 3.4, 0.4, 0, 7); ctx.fill();
    } else if (girl) {
      ctx.beginPath(); ctx.moveTo(-6, -19); ctx.lineTo(6, -19); ctx.quadraticCurveTo(9, -10, 10, -5); ctx.lineTo(-10, -5); ctx.quadraticCurveTo(-9, -10, -6, -19); ctx.closePath(); ctx.fill();
      ctx.fillStyle = C.bodyDark; ctx.fillRect(-10, -7, 20, 2);
      // the letter "i" on her dress (un-flipped so it always reads correctly)
      ctx.save(); ctx.scale(p.face, 1);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(0, -15.6, 1.25, 0, 7); ctx.fill();
      rr(ctx, -1.05, -13.6, 2.1, 5.2, 1); ctx.fill();
      ctx.restore();
    } else if (groom) {
      // tuxedo: black jacket, white shirt front, buttons, pink boutonniere
      ctx.fillStyle = '#25232e'; rr(ctx, -7.5, -19.5, 15, 15, 3.5); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(-3, -19.5); ctx.lineTo(3, -19.5); ctx.lineTo(0, -9.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#25232e'; ctx.beginPath(); ctx.moveTo(-3, -19.5); ctx.lineTo(-0.6, -11.5); ctx.lineTo(-5.4, -13.5); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(3, -19.5); ctx.lineTo(0.6, -11.5); ctx.lineTo(5.4, -13.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6c6a78'; ctx.beginPath(); ctx.arc(0, -8.6, 0.7, 0, 7); ctx.arc(0, -6.2, 0.7, 0, 7); ctx.fill();
      ctx.fillStyle = '#ff8fb8'; ctx.beginPath(); ctx.arc(-4.5, -15, 1.5, 0, 7); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-4.5, -15, 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#17151d'; ctx.fillRect(-7.5, -6.5, 15, 1.6);
    } else {
      rr(ctx, -7, -19, 14, 14, 4); ctx.fill();
      ctx.fillStyle = C.bodyDark; ctx.fillRect(-7, -9, 14, 3);
    }
    if (bride) {
      // pearl necklace instead of the scarf
      ctx.fillStyle = '#fffaf0';
      for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(-5 + i * 1.65, -20 + Math.sin(i / 6 * Math.PI) * 1.6, 0.85, 0, 7); ctx.fill(); }
    } else if (groom) {
      // pink bow tie
      ctx.fillStyle = '#ff5d8f';
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-4.5, -22.5); ctx.lineTo(-4.5, -17.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(4.5, -22.5); ctx.lineTo(4.5, -17.5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e23a6e'; ctx.beginPath(); ctx.arc(0, -20, 1.4, 0, 7); ctx.fill();
    } else {
    // scarf (red, matches the string)
    ctx.fillStyle = '#e8344e';
    rr(ctx, -7, -21, 14, 4.5, 2); ctx.fill();
    const flap = Math.sin(t * 8 + (girl ? 2 : 0)) * 2 + (moving || air ? 2 : 0);
    ctx.beginPath(); ctx.moveTo(-5, -19); ctx.quadraticCurveTo(-11, -17 + flap * 0.3, -14 - flap, -14 + flap * 0.5); ctx.lineTo(-11 - flap * 0.5, -12); ctx.quadraticCurveTo(-8, -15, -3, -17); ctx.closePath(); ctx.fill();
    }
    // arms
    ctx.fillStyle = C.skin;
    if (dance && !air) { const u = Math.sin(db); ctx.beginPath(); ctx.arc(-10.5, -25 + u * 3.5, 2.8, 0, 7); ctx.arc(10.5, -25 - u * 3.5, 2.8, 0, 7); ctx.fill(); }
    else if (sipping) { ctx.beginPath(); ctx.arc(-8.5, -12, 2.8, 0, 7); ctx.fill(); }
    else if (eating || orange) { /* hands are drawn with the food */ }
    else if (punching) { ctx.beginPath(); ctx.arc(-8.5, -14, 2.8, 0, 7); ctx.fill(); }
    else if (bride && !air && !p.anchored) { /* hands hold the bouquet */ }
    else if (shining) { ctx.beginPath(); ctx.arc(-8.5, -12, 2.8, 0, 7); ctx.fill(); }
    else if (p.anchored && p.wallSide) { ctx.beginPath(); ctx.arc(9, -22, 2.8, 0, 7); ctx.arc(9, -14, 2.8, 0, 7); ctx.fill(); }
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
      if (bride) {
        // tiara with little flowers
        ctx.fillStyle = '#ffd86b';
        ctx.beginPath(); ctx.moveTo(-7, -40); ctx.lineTo(-5, -45); ctx.lineTo(-2.5, -41.5); ctx.lineTo(0.5, -47); ctx.lineTo(3, -41.5); ctx.lineTo(5.5, -45); ctx.lineTo(7, -40); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9be7ff'; ctx.beginPath(); ctx.arc(0.5, -43.6, 1.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff8fb8'; ctx.beginPath(); ctx.arc(-5, -43, 0.8, 0, 7); ctx.arc(5.5, -43, 0.8, 0, 7); ctx.fill();
        for (const [fx, fy] of [[-9.5, -38.5], [9.5, -38.5]]) {
          ctx.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * 1.5, fy + Math.sin(a) * 1.5, 1.2, 0, 7); ctx.fill(); }
          ctx.fillStyle = '#ffcf4d'; ctx.beginPath(); ctx.arc(fx, fy, 0.9, 0, 7); ctx.fill();
        }
      } else if (outfit === 1) {
        // straw sun hat with a pink ribbon
        ctx.fillStyle = '#f0cd7a'; ctx.beginPath(); ctx.ellipse(0, -40, 15, 4, -0.05, 0, 7); ctx.fill();
        ctx.fillStyle = '#e0b85a'; ctx.beginPath(); ctx.ellipse(0, -39.2, 14, 2.4, -0.05, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#f6dc92'; ctx.beginPath(); ctx.arc(0, -41, 8, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff6fa3'; ctx.fillRect(-8, -42.6, 16, 2.2);
        ctx.beginPath(); ctx.moveTo(6, -42); ctx.lineTo(11, -39); ctx.lineTo(7.5, -38); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-4, -45, 1.1, 0, 7); ctx.arc(2, -46, 1.1, 0, 7); ctx.fill();
      } else if (outfit === 2) {
        // silver tiara with a star, hair bow stays small beside it
        ctx.fillStyle = '#e8ecf7';
        ctx.beginPath(); ctx.moveTo(-7, -40); ctx.lineTo(-5.5, -44); ctx.lineTo(-2.5, -41.5); ctx.lineTo(0.5, -47); ctx.lineTo(3.5, -41.5); ctx.lineTo(6, -44); ctx.lineTo(7.5, -40); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd43b'; starPath(ctx, 0.5, -46.5, 2.6, t * 2); ctx.fill();
        ctx.fillStyle = '#ff8fd0'; ctx.beginPath(); ctx.arc(-5.5, -43, 0.9, 0, 7); ctx.arc(6, -43, 0.9, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(-7, -40.5, 14.5, 0.8);
      } else {
      // bow
      ctx.fillStyle = C.bow;
      ctx.save(); ctx.translate(-5, -41); ctx.rotate(-0.3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-7, -4); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -4); ctx.lineTo(7, 4); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill(); ctx.restore();
      }
    } else {
      ctx.beginPath(); ctx.arc(0, -31, 11.2, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-11, -31); ctx.lineTo(-8, -27); ctx.lineTo(-5, -31); ctx.lineTo(-1, -28); ctx.lineTo(3, -32); ctx.lineTo(7, -29); ctx.lineTo(11, -32); ctx.lineTo(11, -36); ctx.lineTo(-11, -36); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-2, -41); ctx.quadraticCurveTo(2, -46, 6, -43); ctx.quadraticCurveTo(3, -42, 2, -40); ctx.closePath(); ctx.fill();
      if (groom) {
        // top hat with a pink band
        ctx.fillStyle = '#17151d'; ctx.beginPath(); ctx.ellipse(0, -39.5, 11.5, 2.8, 0, 0, 7); ctx.fill();
        rr(ctx, -7, -52, 14, 13, 2); ctx.fill();
        ctx.fillStyle = '#ff5d8f'; ctx.fillRect(-7, -43.6, 14, 2.6);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-5.2, -50.5, 1.6, 9);
      }
    }
    // face
    const blink = p.blinkT < 0 || kissing || sk > 0.6;
    if (dance || glowing || chewing) {
      ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(1.5, -27.6, 1.7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.arc(7, -27.6, 1.7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      ctx.fillStyle = '#2b2140';
      const eh = blink ? 0.4 : 2.3;
      ctx.beginPath(); ctx.ellipse(1.5, -28.5, 1.6, eh, 0, 0, 7); ctx.ellipse(7, -28.5, 1.6, eh, 0, 0, 7); ctx.fill();
      if (!blink) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(2, -29.5, 0.6, 0, 7); ctx.arc(7.5, -29.5, 0.6, 0, 7); ctx.fill(); }
    }
    ctx.fillStyle = glowing ? 'rgba(255,80,120,0.75)' : sipping || dance || eating ? 'rgba(255,100,130,0.6)' : 'rgba(255,120,140,0.45)';
    const bl = glowing || chewing ? 1.35 : 1;
    ctx.beginPath(); ctx.ellipse(-2, -25, 2.2 * bl, 1.4 * bl, 0, 0, 7); ctx.ellipse(9.5, -25, 2 * bl, 1.4 * bl, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a3a3a'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    if (chewing) { ctx.fillStyle = '#a8434f'; const o = Math.abs(Math.sin((p.actT || 0) * 16)); ctx.beginPath(); ctx.ellipse(4.5, -24.6, 1.8, 0.4 + o * 1.1, 0, 0, 7); ctx.fill(); }
    else if (dance || glowing) { ctx.fillStyle = '#a8434f'; ctx.beginPath(); ctx.arc(4.5, -25.2, 2, 0, Math.PI); ctx.fill(); }
    else if ((eating || orange) && ek > 0.5) { ctx.fillStyle = '#a8434f'; ctx.beginPath(); ctx.ellipse(4.5, -24.6, 1.7, 1.6, 0, 0, 7); ctx.fill(); }
    else if (sk > 0.4) { ctx.beginPath(); ctx.arc(4.5, -24.8, 0.9, 0, 7); ctx.stroke(); }
    else {
      ctx.beginPath();
      if (p.vy > 400 && air) ctx.arc(4.5, -24, 1.5, 0, 7); else ctx.arc(4.5, -25, 1.8, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    if (girl) { ctx.strokeStyle = '#2b2140'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(8.5, -31); ctx.lineTo(9.8, -32); ctx.moveTo(3, -31); ctx.lineTo(1.6, -32); ctx.stroke(); }
    if (sipping) {
      const cx = 9.5 - sk * 2, cy = -12 - sk * 6;
      drawMatchaCup(ctx, cx, cy);
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(cx + 3, cy + 1.2, 2.8, 0, 7); ctx.fill();
    }
    if (eating) {
      drawIskender(ctx, 4.5, -9.5, p);
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(-3.5, -9, 2.8, 0, 7); ctx.fill();
      // fork: plate -> mouth
      const hx = 11 - ek * 3, hy = -12 - ek * 11.5;
      const tx = hx - 4.2 + ek * 0.4, ty = hy - 1.5 - ek * 1.2;
      ctx.strokeStyle = '#c9ced8'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx + 1.5, hy + 0.8); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.lineWidth = 0.55;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - 2, ty - 0.6 + i * 0.75); ctx.stroke(); }
      if (!p.sipped && ek > 0.02) { ctx.fillStyle = '#9a4f2a'; rr(ctx, tx - 3.4, ty - 1.4, 2.8, 2.2, 0.8); ctx.fill(); ctx.fillStyle = '#d9302c'; ctx.fillRect(tx - 3.2, ty - 1.5, 2.4, 0.7); }
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(hx, hy, 2.8, 0, 7); ctx.fill();
    }
    if (orange) {
      // a juicy orange: a few bites taken out of it already
      const hx = 9.5 - ek * 2.5, hy = -12 - ek * 9;
      const bites = Math.min(3, Math.floor((p.actT || 0) / 1.8 + (p.sipped ? 1 : 0)));
      ctx.save(); ctx.translate(hx - 1.5, hy - 3.2);
      const og = ctx.createRadialGradient(-1.2, -1.2, 0.5, 0, 0, 4.6);
      og.addColorStop(0, '#ffc15a'); og.addColorStop(1, '#ff8a00');
      ctx.fillStyle = og; ctx.beginPath(); ctx.arc(0, 0, 4.4, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(200,90,0,0.5)'; for (const [dx, dy] of [[1.6, 1.4], [-1.8, 0.8], [0.4, -1.9], [2.4, -0.8]]) { ctx.beginPath(); ctx.arc(dx, dy, 0.3, 0, 7); ctx.fill(); }
      if (bites > 0) {
        ctx.fillStyle = '#ffd88a'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 4.4, -Math.PI * 0.55, -Math.PI * 0.55 + bites * 0.55); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 0.4; for (let i = 0; i <= bites; i++) { const a = -Math.PI * 0.55 + i * 0.55; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 4.2, Math.sin(a) * 4.2); ctx.stroke(); }
      }
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.ellipse(-1.8, -2, 1.1, 0.6, -0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(1.6, -4.6, 1.7, 0.7, -0.5, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(hx, hy, 2.8, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-8.5, -12, 2.8, 0, 7); ctx.fill();
    }
    if (bride && !busyHands && !air && !p.anchored) {
      // bouquet held in both hands
      const bx = 6, by = -12;
      ctx.strokeStyle = '#5aa04a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(bx - 1, by + 1); ctx.lineTo(bx + 1, by + 7); ctx.moveTo(bx + 1, by + 1); ctx.lineTo(bx + 2.5, by + 6.5); ctx.stroke();
      ctx.fillStyle = '#ff9ec4'; ctx.fillRect(bx - 0.5, by + 2.2, 3, 1.6);
      const fl = [[-2.5, -1, '#ffffff'], [1.5, -2.5, '#ff7aa8'], [4, 0, '#ffffff'], [0.5, 1, '#ffc2d8'], [-1, -3.5, '#ff4f8b'], [3, -4, '#ffffff']];
      for (const [dx, dy, col] of fl) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx + dx, by + dy, 1.9, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#6cc35a'; ctx.beginPath(); ctx.ellipse(bx - 4, by + 0.5, 1.8, 0.8, 0.5, 0, 7); ctx.ellipse(bx + 6, by - 1, 1.8, 0.8, -0.5, 0, 7); ctx.fill();
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(bx - 1.5, by + 4, 2.6, 0, 7); ctx.arc(bx + 2.5, by + 4.5, 2.6, 0, 7); ctx.fill();
    }
    if (punching) {
      // SUPER punch: the fist shoots forward with speed lines
      const k = 1 - p.punchT / 0.55, ext = Math.sin(Math.min(1, k * 2.2) * Math.PI * 0.5) * (1 - Math.max(0, k - 0.6) * 2);
      const fx = 9 + ext * 11, fy = -15;
      ctx.strokeStyle = 'rgba(255,230,140,0.85)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fx - 6 - ext * 8, fy + i * 3); ctx.lineTo(fx - 5, fy + i * 3); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,220,110,0.45)'; ctx.beginPath(); ctx.arc(fx, fy, 7 + ext * 2, 0, 7); ctx.fill();
      ctx.fillStyle = C.body; rr(ctx, 4, fy - 2.5, fx - 6, 5, 2.5); ctx.fill();
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(fx, fy, 4.4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(150,90,70,0.6)'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(fx + 1.5, fy - 2.6); ctx.lineTo(fx + 1.5, fy + 2.6); ctx.moveTo(fx - 0.5, fy - 3); ctx.lineTo(fx - 0.5, fy + 3); ctx.stroke();
    }
    if (shining) {
      // she raises a little star wand (higher and bigger for the SUPER power)
      const sup = (p.superT || 0) > 0;
      const e = wandUp ? 1 : Math.min(1, (SHINE_DUR - p.shineT) * 5);
      const hx = 9.5, hy = -13 - 11 * e - (sup ? 6 : 0);
      ctx.strokeStyle = '#f4d58d'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 4.5, hy - 7); ctx.stroke();
      ctx.fillStyle = C.skin; ctx.beginPath(); ctx.arc(hx, hy, 2.8, 0, 7); ctx.fill();
      const sx = hx + 5.2, sy = hy - 8.2;
      const ss = sup ? 1.6 : 1;
      ctx.fillStyle = sup ? 'rgba(255,150,230,0.5)' : 'rgba(255,240,150,0.45)'; ctx.beginPath(); ctx.arc(sx, sy, (5 + Math.sin(t * 9) * 0.8) * ss, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffd43b'; starPath(ctx, sx, sy, 3.6 * ss, t * (sup ? 9 : 3)); ctx.fill();
      ctx.fillStyle = '#fff'; starPath(ctx, sx - 0.4, sy - 0.4, 1.3, t * 3); ctx.fill();
    }
    ctx.restore();
  }

  // the boy as a tangerine or a potato (cute face, tiny feet, still wearing his red scarf)
  function drawMorph(ctx, p, t, moving, air, bob) {
    const form = p.morphForm, wt = p.walkT;
    const ag = Math.min(1, (form === 'tangerine' ? MORPH_DUR - p.morphT : MORPH_DUR / 2 - p.morphT) * 4);
    const sc = 0.6 + 0.4 * (1 - Math.pow(1 - ag, 3)) + Math.sin(ag * Math.PI) * 0.15;
    // feet
    ctx.fillStyle = LOOK.boy.shoe;
    const la = moving ? Math.sin(wt) * 3 : 0;
    if (air) { rr(ctx, -6, -6, 5, 5, 2); ctx.fill(); rr(ctx, 1, -5, 5, 5, 2); ctx.fill(); }
    else { rr(ctx, -6 + la * 0.6, -5, 5, 5, 2); ctx.fill(); rr(ctx, 1 - la * 0.6, -5, 5, 5, 2); ctx.fill(); }
    ctx.translate(0, bob - 3);
    ctx.scale(sc, sc);
    const cy = -14;
    if (form === 'tangerine') {
      const g = ctx.createRadialGradient(-4, cy - 5, 2, 0, cy, 14);
      g.addColorStop(0, '#ffc15a'); g.addColorStop(0.6, '#ff9a1f'); g.addColorStop(1, '#f07800');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, cy, 13, 12, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(190,80,0,0.35)';
      for (const [dx, dy] of [[-8, -3], [-5, 5], [7, 4], [9, -4], [-2, 8], [3, -8], [-9, 2]]) { ctx.beginPath(); ctx.arc(dx, cy + dy, 0.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-6, cy - 6, 3, 1.6, -0.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#6b4a2b'; ctx.fillRect(-0.8, cy - 14, 1.6, 3);
      ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(3.5, cy - 13, 4, 1.7, -0.4 + Math.sin(t * 3) * 0.1, 0, 7); ctx.fill();
      ctx.fillStyle = '#66c35a'; ctx.beginPath(); ctx.ellipse(-3, cy - 13.5, 3, 1.4, 0.5, 0, 7); ctx.fill();
    } else {
      const g = ctx.createRadialGradient(-3, cy - 5, 2, 0, cy, 15);
      g.addColorStop(0, '#e2b07a'); g.addColorStop(1, '#a8743f');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, cy, 11, 14, 0.12, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(-8, cy + 6, 4.5, 0, 7); ctx.arc(8.5, cy - 4, 4, 0, 7); ctx.arc(-5, cy - 10, 4.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(110,70,30,0.45)';
      for (const [dx, dy, r] of [[-6, -6, 1], [6, 7, 1.2], [8, -8, 0.8], [-8, 5, 0.9], [2, 11, 0.8]]) { ctx.beginPath(); ctx.ellipse(dx, cy + dy, r, r * 0.7, 0.4, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#7bc96f'; ctx.beginPath(); ctx.ellipse(-3, cy - 15.5, 1, 2.6, -0.4 + Math.sin(t * 4) * 0.2, 0, 7); ctx.ellipse(-0.5, cy - 15, 1, 2.2, 0.4, 0, 7); ctx.fill();
    }
    // scarf
    ctx.fillStyle = '#e8344e';
    rr(ctx, -6, cy + 5, 12, 3.4, 1.7); ctx.fill();
    const flap = Math.sin(t * 8) * 2 + (moving || air ? 2 : 0);
    ctx.beginPath(); ctx.moveTo(-4, cy + 7); ctx.quadraticCurveTo(-9, cy + 9, -12 - flap, cy + 11 + flap * 0.4); ctx.lineTo(-9, cy + 12); ctx.quadraticCurveTo(-6, cy + 10, -2, cy + 8.5); ctx.closePath(); ctx.fill();
    // face
    const blink = p.blinkT < 0;
    ctx.fillStyle = '#2b2140';
    ctx.beginPath(); ctx.ellipse(1, cy - 1.5, 1.6, blink ? 0.4 : 2.3, 0, 0, 7); ctx.ellipse(6.5, cy - 1.5, 1.6, blink ? 0.4 : 2.3, 0, 0, 7); ctx.fill();
    if (!blink) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(1.5, cy - 2.5, 0.6, 0, 7); ctx.arc(7, cy - 2.5, 0.6, 0, 7); ctx.fill(); }
    if (form === 'potato') { ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-0.5, cy - 5.5); ctx.lineTo(2.5, cy - 4.8); ctx.moveTo(8, cy - 5.5); ctx.lineTo(5, cy - 4.8); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,90,110,0.55)'; ctx.beginPath(); ctx.ellipse(-2.5, cy + 2, 2.2, 1.3, 0, 0, 7); ctx.ellipse(9.5, cy + 2, 2, 1.3, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#7a3a3a'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    ctx.beginPath(); if (form === 'potato') ctx.arc(4, cy + 3.6, 1.2, 0, 7); else ctx.arc(4, cy + 2, 1.9, 0.2, Math.PI - 0.2); ctx.stroke();
  }

  // İskender kebab on a plate: pide cubes, döner slices, tomato sauce, butter, yoghurt, pepper and tomato
  function drawIskender(ctx, cx, cy, p) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(cx, cy + 1.6, 9.5, 2.2, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.ellipse(cx, cy, 9.5, 2.8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#4c7fd6'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.ellipse(cx, cy, 8.4, 2.2, 0, 0, 7); ctx.stroke();
    // pide cubes
    ctx.fillStyle = '#e2b26a';
    for (let i = 0; i < 4; i++) { rr(ctx, cx - 5.5 + i * 2.7, cy - 2.4 - (i % 2) * 0.4, 2.5, 2.1, 0.6); ctx.fill(); }
    // döner slices
    const sl = ['#8c4523', '#a8582f', '#7a3b1d', '#b0653a'];
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = sl[i % 4];
      ctx.beginPath(); ctx.ellipse(cx - 4.6 + i * 2.2, cy - 3.6 - Math.sin(i * 1.3) * 0.5, 1.9, 1.05, -0.35 + i * 0.12, 0, 7); ctx.fill();
    }
    // tomato sauce + melted butter glaze
    ctx.fillStyle = 'rgba(214,40,36,0.85)';
    ctx.beginPath(); ctx.ellipse(cx - 1, cy - 4.1, 4.8, 1, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,90,0.8)'; ctx.beginPath(); ctx.ellipse(cx - 2.4, cy - 4.5, 1.6, 0.45, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(cx + 0.4, cy - 4.7, 1.2, 0.4);
    // yoghurt dollop
    ctx.fillStyle = '#fbfbf6'; ctx.beginPath(); ctx.arc(cx - 6.6, cy - 1.6, 1.9, 0, 7); ctx.arc(cx - 6.1, cy - 2.9, 1.2, 0, 7); ctx.fill();
    // roasted green pepper + tomato
    ctx.fillStyle = '#3f9b3a'; ctx.beginPath(); ctx.ellipse(cx + 6.3, cy - 1.5, 2.5, 0.85, -0.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#2c7a2a'; ctx.fillRect(cx + 8.1, cy - 3.2, 0.5, 1);
    ctx.fillStyle = '#e8402f'; ctx.beginPath(); ctx.arc(cx + 4.3, cy - 2.4, 1.35, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(cx + 3.9, cy - 2.8, 0.4, 0, 7); ctx.fill();
    ctx.restore();
  }

  // iced strawberry matcha latte: pink strawberry milk at the bottom, matcha on top
  function drawMatchaCup(ctx, cx, cy) {
    const w1 = 3.7, w2 = 2.8, h = 4.8;
    ctx.save();
    ctx.beginPath(); ctx.moveTo(cx - w1, cy - h); ctx.lineTo(cx + w1, cy - h); ctx.lineTo(cx + w2, cy + h); ctx.lineTo(cx - w2, cy + h); ctx.closePath();
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, cy - h, 0, cy + h);
    g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.1, '#7cc46a'); g.addColorStop(0.42, '#a6d98c');
    g.addColorStop(0.52, '#fff3ea'); g.addColorStop(0.64, '#ffb3c9'); g.addColorStop(1, '#ff6f98');
    ctx.fillStyle = g; ctx.fillRect(cx - w1, cy - h, w1 * 2, h * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(cx - 2.5, cy - 2.5, 2, 2); ctx.fillRect(cx + 0.6, cy - 1.2, 1.8, 1.8);
    ctx.fillStyle = '#e8344e'; ctx.beginPath(); ctx.arc(cx - 1, cy + 3, 0.65, 0, 7); ctx.arc(cx + 1.3, cy + 2.2, 0.6, 0, 7); ctx.arc(cx + 0.2, cy + 3.9, 0.5, 0, 7); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(cx - w1 + 1, cy - h + 1.5, 0.7, h * 1.4);
    ctx.fillStyle = '#ffffff'; rr(ctx, cx - w1 - 0.7, cy - h - 1.3, (w1 + 0.7) * 2, 1.6, 0.8); ctx.fill();
    ctx.strokeStyle = '#ff5d8f'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx + 0.8, cy - h - 0.6); ctx.lineTo(cx - 3, cy - h - 4); ctx.stroke();
    ctx.fillStyle = '#ff3355'; ctx.beginPath(); ctx.moveTo(cx + w1 - 1.8, cy - h - 1.6); ctx.quadraticCurveTo(cx + w1 + 1.6, cy - h - 2.8, cx + w1 + 0.6, cy - h + 1.4); ctx.quadraticCurveTo(cx + w1 - 1.4, cy - h + 0.4, cx + w1 - 1.8, cy - h - 1.6); ctx.fill();
    ctx.fillStyle = '#51cf66'; ctx.beginPath(); ctx.ellipse(cx + w1 - 0.6, cy - h - 2.4, 1.2, 0.6, -0.4, 0, 7); ctx.fill();
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
            if (G.holes && G.holes.size && G.holes.has(ty * L.W + tx)) {
              if (tileAt(tx, ty + 1) === '#' && !G.holes.has((ty + 1) * L.W + tx)) { ctx.fillStyle = 'rgba(255,120,40,0.35)'; ctx.fillRect(px, py + T - 4, T, 4); }
              break;
            }
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

  function starPath(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const rr2 = i % 2 ? r * 0.45 : r, a = rot + i / 10 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    ctx.closePath();
  }
  function drawParticles(ctx, list, unit) {
    const u = unit || 1;
    for (const p of (list || G.particles)) {
      if (p.delay > 0) continue;
      const a = p.type === 'balloon' ? Math.min(1, p.life * 1.5) : Math.min(1, p.life / p.max * 1.5);
      ctx.globalAlpha = a; ctx.fillStyle = p.color;
      switch (p.type) {
        case 'heart': heartPath(ctx, p.x, p.y, p.size * 1.6); ctx.fill(); break;
        case 'star': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -0.8 * u, p.size, 1.6 * u); ctx.fillRect(-0.8 * u, -p.size / 2, 1.6 * u, p.size); ctx.restore(); break;
        case 'star5':
          starPath(ctx, p.x, p.y, p.size, p.rot); ctx.fill();
          ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#fff'; starPath(ctx, p.x - p.size * 0.12, p.y - p.size * 0.12, p.size * 0.35, p.rot); ctx.fill(); break;
        case 'shard': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(-p.size, -p.size * 0.6); ctx.lineTo(p.size, -p.size * 0.2); ctx.lineTo(-p.size * 0.2, p.size); ctx.closePath(); ctx.fill(); ctx.restore(); break;
        case 'rock': ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); break;
        case 'note': case 'text':
          ctx.font = `700 ${p.size}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = Math.max(1, p.size * 0.18); ctx.lineJoin = 'round';
          ctx.save(); ctx.translate(p.x, p.y); if (p.type === 'note') ctx.rotate(Math.sin(p.rot) * 0.3);
          ctx.strokeText(p.ch || p.text, 0, 0); ctx.fillText(p.ch || p.text, 0, 0); ctx.restore(); break;
        case 'ring': {
          const f = 1 - p.life / p.max;
          ctx.strokeStyle = p.color; ctx.lineWidth = (p.lw || 2) * u * (1 - f);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + f * (p.grow || 2)), 0, 7); ctx.stroke(); break;
        }
        case 'confetti':
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2.3));
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); break;
        case 'balloon': {
          const s = p.size, bx = p.x, by = p.y;
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5 * u;
          ctx.beginPath(); ctx.moveTo(bx, by + s * 0.45); ctx.quadraticCurveTo(bx + Math.sin(p.life * 3) * s * 0.3, by + s * 1.1, bx, by + s * 1.7); ctx.stroke();
          heartPath(ctx, bx, by, s * 1.6); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(bx - s * 0.3, by - s * 0.22, s * 0.14, s * 0.09, -0.6, 0, 7); ctx.fill(); break;
        }
        case 'rocket':
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill();
          ctx.globalAlpha = a * 0.5; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y + p.size * 2, p.size * 0.8, 0, 7); ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawDarkness(ctx) {
    const d = G.darkCtx, z = G.zoom, cx = G.camPx, cy = G.camPy;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, G.cw, G.ch);
    const bo = G.boK || 0, L0 = G.L;
    d.fillStyle = `rgba(4,6,22,${L0.dark ? 0.94 + 0.05 * bo : 0.975 * bo})`; d.fillRect(0, 0, G.cw, G.ch);
    d.globalCompositeOperation = 'destination-out';
    const lk = 1 - 0.8 * bo;
    const light = (wx, wy, r, s) => {
      s *= lk;
      const sx = wx * z - cx, sy = wy * z - cy, sr = r * z;
      if (sx < -sr || sy < -sr || sx > G.cw + sr || sy > G.ch + sr) return;
      const g = d.createRadialGradient(sx, sy, 0, sx, sy, sr);
      g.addColorStop(0, `rgba(0,0,0,${s})`); g.addColorStop(0.55, `rgba(0,0,0,${s * 0.85})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g; d.beginPath(); d.arc(sx, sy, sr, 0, 7); d.fill();
    };
    const L = G.L, t = G.t;
    for (const ch of ['boy', 'girl']) { const p = G.players[ch]; light(p.x + PW / 2, p.y + PH / 2, (165 + Math.sin(t * 6 + (ch === 'boy' ? 0 : 2)) * 4) * (1 - 0.7 * bo), 1 / lk * (1 - 0.35 * bo)); }
    for (const b of G.bombs || []) light((b.tx + 0.5) * T, b.ty * T, 60, 0.8);
    { const g = G.players.girl, e = shineEnv(g); if (e > 0) { const f = faceOf(G.players.boy), s = wandTip(g); light(f.x, f.y, 120 * e, 1); light((f.x + s.x) / 2, (f.y + s.y) / 2 - 12, 70 * e, 0.8); } }
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
      g.addColorStop(0, `rgba(255,190,110,${0.12 * (1 - bo)})`); g.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function wrapText(ctx, text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (let w of words) {
      while (ctx.measureText(w).width > maxW && w.length > 1) {
        let k = w.length - 1; while (k > 1 && ctx.measureText(w.slice(0, k)).width > maxW) k--;
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, k)); w = w.slice(k);
      }
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

  function heartBubble(ctx, sx, sy, text, age, dur) {
    const d = G.dpr, fs = Math.round(14 * d);
    ctx.font = `600 ${fs}px Fredoka, sans-serif`;
    const lines = wrapText(ctx, text, 100 * d), lh = fs * 1.12;
    let tw = 0; for (const l of lines) tw = Math.max(tw, ctx.measureText(l).width);
    const th = lines.length * lh;
    const s = Math.max(tw / 0.7, th / 0.42, 66 * d);
    const k = Math.min(1, age / 0.4), pop = k < 1 ? 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2) : 1;
    const fade = Math.min(1, (dur - age) * 2.5);
    const x = clamp(sx, s * 0.55, G.cw - s * 0.55);
    const y = Math.max(s * 0.45 + 50 * d, sy - s * 0.45 - 6 * d) + Math.sin(age * 3) * 3 * d;
    ctx.save();
    ctx.globalAlpha = clamp(fade, 0, 1);
    ctx.translate(x, y); ctx.scale(Math.max(0.01, pop), Math.max(0.01, pop)); ctx.rotate(Math.sin(age * 2.2) * 0.035);
    ctx.fillStyle = 'rgba(140,20,70,0.22)'; heartPath(ctx, 2 * d, 5 * d, s); ctx.fill();
    const g = ctx.createLinearGradient(0, -s * 0.4, 0, s * 0.45);
    g.addColorStop(0, '#ffa3c4'); g.addColorStop(0.55, '#ff6f9f'); g.addColorStop(1, '#f2457f');
    ctx.fillStyle = g; heartPath(ctx, 0, 0, s); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3 * d; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.ellipse(-s * 0.24, -s * 0.2, s * 0.08, s * 0.045, -0.7, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(160,20,70,0.45)'; ctx.shadowBlur = 3 * d;
    const top = s * 0.0 - th / 2 + lh / 2;
    lines.forEach((l, i) => ctx.fillText(l, 0, top + i * lh));
    ctx.restore();
    // tiny sparkles around the heart
    ctx.globalAlpha = clamp(fade, 0, 1) * 0.9; ctx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) { const a = age * 1.5 + i * 2.1, tw2 = Math.abs(Math.sin(age * 4 + i)); starPath(ctx, x + Math.cos(a) * s * 0.62, y + Math.sin(a) * s * 0.42, 3.5 * d * tw2, a); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  function typingBubble(ctx, sx, sy) {
    const d = G.dpr, w = 42 * d, h = 22 * d, x = sx - w / 2, y = sy - h - 6 * d, t = G.t;
    ctx.fillStyle = 'rgba(40,20,50,0.18)'; rr(ctx, x + 2 * d, y + 3 * d, w, h, h / 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.97)'; rr(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.beginPath(); ctx.arc(sx - 6 * d, y + h + 2 * d, 3 * d, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(sx - 9 * d, y + h + 7 * d, 1.8 * d, 0, 7); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const b = Math.max(0, Math.sin(t * 8 - i * 0.9)) * 4 * d;
      ctx.fillStyle = ['#ff5d8f', '#ff8fb1', '#ffb3c7'][i];
      ctx.beginPath(); ctx.arc(sx + (i - 1) * 10 * d, y + h / 2 - b, 3.4 * d, 0, 7); ctx.fill();
    }
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
      const stext = global.I18N ? global.I18N.sign(s.key, s.text) : s.text;
      if (!near || !stext) continue;
      const fs = Math.round(15 * d);
      ctx.font = `500 ${fs}px Fredoka, sans-serif`;
      const lines = wrapText(ctx, stext, Math.min(340 * d, G.cw * 0.8));
      const sp = toS(s.x, s.y - 40);
      bubble(ctx, sp.x, sp.y, lines, fs);
    }
    // names & emotes
    for (const ch of ['boy', 'girl']) {
      const p = G.players[ch];
      const sp = toS(p.x + PW / 2, p.y - 18);
      let top = sp.y;
      if (p.typing) { typingBubble(ctx, sp.x, top); top -= 30 * d; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; }
      if (p.say) {
        heartBubble(ctx, sp.x, top, p.say.text, p.say.age, p.say.dur);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      } else if (p.typing) {
        // name tag hidden while typing
      } else if (p.emoteT > 0) {
        const fs = Math.round(17 * d);
        ctx.font = `600 ${fs}px Fredoka, sans-serif`;
        ctx.globalAlpha = Math.min(1, p.emoteT * 3);
        bubble(ctx, sp.x, sp.y - 6 * d, wrapText(ctx, String(p.emote), 250 * d), fs);
        ctx.globalAlpha = 1;
      } else if (G.mode === 'online' || G.introT > 0) {
        const name = G.mode === 'online' ? (p.local ? tr('game.you') : (G.names[ch] || tr('game.partner'))) : (G.schemes[ch] === 'p1' ? tr('game.p1') : tr('game.p2'));
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
      const label = G.mode === 'online' ? tr('game.kissOnline') : tr('game.kissLocal');
      const fs = Math.round(13 * d);
      ctx.font = `600 ${fs}px Fredoka, sans-serif`;
      const w = ctx.measureText(label).width + 16 * d;
      const bob = Math.sin(G.t * 4) * 2 * d;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; rr(ctx, sp.x - w / 2, sp.y - 11 * d + bob, w, 22 * d, 11 * d); ctx.fill();
      ctx.fillStyle = '#e23a6e'; ctx.fillText(label, sp.x, sp.y + 0.5 * d + bob);
    }
    // super-power prompt when side by side and a monster is close
    if (G.L.hard && G.introT <= 0 && G.state === 'play' && sideBySide() && G.mon.some(m => m.alive && !m.dying && nearestPlayer(monCenter(m).x, monCenter(m).y).d < SUPER_R + 3 * T)) {
      const m = kissMid(), sp = toS(m.x, m.y - 56);
      const label = G.mode === 'online' ? tr('game.superOnline') : tr('game.super');
      const fs = Math.round(14 * d);
      ctx.font = `700 ${fs}px Fredoka, sans-serif`;
      const w = ctx.measureText(label).width + 18 * d, bob = Math.sin(G.t * 7) * 2 * d;
      const gg = ctx.createLinearGradient(sp.x - w / 2, 0, sp.x + w / 2, 0); gg.addColorStop(0, '#ff5d8f'); gg.addColorStop(1, '#ffb347');
      ctx.fillStyle = gg; rr(ctx, sp.x - w / 2, sp.y - 12 * d + bob, w, 24 * d, 12 * d); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(label, sp.x, sp.y + 0.5 * d + bob);
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
      const I = global.I18N;
      ctx.fillText(`${L.world.icon} ${I ? I.levelName(L.wi, L.local) : L.name}`, G.cw / 2, G.ch * 0.44);
      ctx.font = `500 ${Math.round(16 * d)}px Fredoka, sans-serif`;
      ctx.fillText(tr('game.stageOf', { world: I ? I.worldName(L.wi) : L.world.name, n: L.n }), G.cw / 2, G.ch * 0.51);
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
    if (G.shake > 0) { const a = G.shake * 9 * G.dpr; G.camPx += Math.round((Math.random() - 0.5) * a); G.camPy += Math.round((Math.random() - 0.5) * a); }
    updateBackground(dt);
    updateCelebration(dt);
    drawBackground(ctx, th, G.cam.x, G.cam.y, Math.max(0, L.H * T - vh));
    ctx.setTransform(z, 0, 0, z, -G.camPx, -G.camPy);
    ctx.imageSmoothingEnabled = true;
    const x0 = Math.max(0, Math.floor(G.cam.x / T) - 1), x1 = Math.min(L.W - 1, Math.floor((G.cam.x + vw) / T) + 1);
    const y0 = Math.max(0, Math.floor(G.cam.y / T) - 1), y1 = Math.min(L.H - 1, Math.floor((G.cam.y + vh) / T) + 1);
    for (const d of L.decor) if (d.x > G.cam.x - 40 && d.x < G.cam.x + vw + 40) drawDecor(ctx, d, t);
    drawTiles(ctx, x0, x1, y0, y1, t);
    drawEntities(ctx, t);
    drawHardWorld(ctx, t, false);
    drawHardWorld(ctx, t, true);
    drawRope(ctx);
    const order = G.mode === 'online' ? [other(G.myChar), G.myChar] : ['boy', 'girl'];
    drawShine(ctx, G.players.girl, G.players.boy, t, false);
    for (const ch of order) drawCharacter(ctx, G.players[ch], t);
    drawShine(ctx, G.players.girl, G.players.boy, t, true);
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
    if (L.dark || G.boK > 0) {
      drawDarkness(ctx);
      ctx.setTransform(z, 0, 0, z, -G.camPx, -G.camPy); drawGlows(ctx, t); ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    drawThreat(ctx);
    const vg = ctx.createRadialGradient(G.cw / 2, G.ch / 2, G.ch * 0.45, G.cw / 2, G.ch / 2, G.ch * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,10,40,0.28)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, G.cw, G.ch);
    drawOverlays(ctx);
    drawCelebration(ctx);
  }

  // ---------- menu background scene ----------
  const menuPlayers = { boy: makePlayer('boy'), girl: makePlayer('girl') };
  function renderMenu(dt) {
    const ctx = G.ctx; G.menuT += dt;
    const th = HS.THEMES.meadow;
    if (!G.ambient.length) initAmbient();
    const fakeL = { theme: th, themeKey: 'meadow' };
    updateBackground(dt);
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
    // the girl cycles: hop → dance → strawberry matcha → she lights him up while he eats İskender
    const phase = Math.floor(G.menuT / 5) % 6, pt = G.menuT % 5;
    const hop = phase === 0 ? Math.max(0, Math.sin(G.menuT * 2.2)) * 10 : 0;
    g.act = phase === 1 ? 'dance' : phase === 2 ? 'matcha' : null; g.actT = pt;
    b.act = phase === 1 && pt > 1.5 ? 'dance' : phase === 3 ? 'eat' : null; b.actT = pt;
    if (phase === 3) { const k = sipPhase(pt); if (k > 0.9) { b.sipped = true; b.chewT = 0.9; } else if (k < 0.1) b.sipped = false; b.chewT = Math.max(0, (b.chewT || 0) - dt); }
    g.shineT = phase === 3 && pt > 0.6 ? Math.max(0, SHINE_DUR - (pt - 0.6)) : 0; b.glowT = g.shineT;
    // phase 4: he dresses her as a bride · phase 5: she turns him into a tangerine, then a potato
    g.bridalT = phase === 4 && pt > 0.4 ? 5 - pt : 0; b.groom = g.bridalT > 0;
    g.castT = phase === 5 && pt < 0.9 ? 0.9 - pt : 0;
    b.morphT = phase === 5 && pt > 0.3 ? Math.max(0.01, MORPH_DUR - (pt - 0.3) * (MORPH_DUR / 4.6)) : 0;
    b.morphForm = b.morphT > 0 ? (b.morphT > MORPH_DUR / 2 ? 'tangerine' : 'potato') : null;
    b.x = -46; b.y = -PH; b.face = 1; b.grounded = true; b.blinkT -= dt; if (b.blinkT < -0.12) b.blinkT = 2 + Math.random() * 3;
    g.x = 24; g.y = -PH - hop; g.face = -1; g.grounded = hop < 1; g.blinkT -= dt; if (g.blinkT < -0.12) g.blinkT = 2 + Math.random() * 3;
    ctx.setTransform(z, 0, 0, z, cx, groundY);
    // rope
    const ax = b.x + PW / 2 + 7, ay = b.y + PH - 13, bx = g.x + PW / 2 - 7, by = g.y + PH - 13;
    ctx.strokeStyle = '#e3304b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 16 - hop * 0.5, bx, by); ctx.stroke();
    ctx.fillStyle = '#ff2d55'; heartPath(ctx, (ax + bx) / 2, (ay + by) / 2 + 8 - hop * 0.25, 11); ctx.fill();
    drawShine(ctx, g, b, G.menuT, false);
    drawCharacter(ctx, b, G.menuT); drawCharacter(ctx, g, G.menuT);
    drawShine(ctx, g, b, G.menuT, true);
    if (Math.random() < dt * 1.2) G.particles.push({ x: (Math.random() - 0.5) * 60, y: -50, vx: (Math.random() - 0.5) * 20, vy: -40, life: 2, max: 2, color: '#ff7aa8', size: 5, type: 'heart', g: -5, rot: 0 });
    for (let i = G.particles.length - 1; i >= 0; i--) { const p = G.particles[i]; p.life -= dt; if (p.life <= 0) { G.particles.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; }
    if (g.act === 'dance' && Math.random() < dt * 3) G.particles.push({ x: g.x + PW / 2 + (Math.random() - 0.5) * 20, y: -46, vx: (Math.random() - 0.5) * 30, vy: -35, life: 1.6, max: 1.6, color: RAINBOW[Math.floor(Math.random() * 6)], size: 11, type: 'note', ch: Math.random() < 0.5 ? '♪' : '♫', g: 0, rot: 0 });
    drawParticles(ctx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (g.act === 'matcha' && pt > 0.3 && pt < 4.7) {
      const fs = Math.round(Math.max(13, 7 * z) * 1);
      ctx.font = `600 ${fs}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.min(1, (pt - 0.3) * 4, (4.7 - pt) * 4);
      bubble(ctx, cx + (g.x + PW / 2) * z, groundY + (g.y - 16) * z, [tr('act.matcha')], fs);
      ctx.globalAlpha = 1;
    }
    if (phase >= 3 && pt > 0.3 && pt < 4.7) {
      const fs = Math.round(Math.max(13, 7 * z));
      ctx.font = `600 ${fs}px Fredoka, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.min(1, (pt - 0.3) * 4, (4.7 - pt) * 4);
      const who = phase === 5 ? g : b, key = phase === 3 ? 'act.eat' : phase === 4 ? 'act.bride' : 'act.morph';
      bubble(ctx, cx + (who.x + PW / 2) * z, groundY + (who.y - 16) * z, wrapText(ctx, tr(key), 230 * G.dpr), fs);
      ctx.globalAlpha = 1;
    }
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
    const ph = Math.floor(t / 4) % 3;
    if (char === 'girl') { p.act = ph === 1 ? 'dance' : ph === 2 ? 'matcha' : null; p.actT = t % 4; }
    else { p.act = ph === 1 ? 'dance' : null; p.actT = t % 4 + 0.4; }
    p.x = -PW / 2; p.y = -PH;
    const s = canvas.height / 60;
    ctx.setTransform(s, 0, 0, s, canvas.width / 2, canvas.height * 0.86);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 3, 0, 0, 7); ctx.fill();
    drawCharacter(ctx, p, t);
  }

  global.Game = {
    init, startLevel, stop, onNet, drawPreview,
    act(ch, kind) { return startAct(ch, kind, true); },
    shine(ch) { return startShine(ch, true); },
    magic(ch) { return doMagic(ch, true); },
    outfit(ch) { return cycleOutfit(ch, true); },
    superPower(ch) { return trySuper(ch, true); },
    say(ch, i) { if (G.players) sayPhrase(ch, i, true); },
    chat(ch, text) { if (G.players) chatSay(ch, text, true); },
    setTyping(ch, on) { if (G.players) setTyping(ch, on, G.mode === 'online'); },
    get mode() { return G.mode; },
    get myChar() { return G.myChar; },
    setHooks(h) { Object.assign(G.hooks, h); },
    setPaused(v) { G.paused = !!v; G.keys.clear(); },
    setPing(ms) { G.ping = ms; },
    get state() { return G.state; },
    get level() { return G.L; },
    _G: G, _step: step, _kiss: tryKiss, _const: { P, ROPE_MAX, PW, PH, DT },
  };
})(typeof window !== 'undefined' ? window : globalThis);
