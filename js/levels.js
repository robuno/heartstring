/* Heartstring — worlds, themes, hand-made level chunks and the seeded level builder.
 * Every level (1..100) is generated deterministically from its number, so both
 * computers always build exactly the same map without sending it over the network.
 *
 * Chunk legend (each chunk is 16 rows tall; shorter definitions are padded on top):
 *  .  empty            #  ground            =  jump-through plank
 *  ^  floor spikes     v  ceiling spikes    ~  lava
 *  B  bounce mushroom  I  ice (no anchoring) C  crumbling stone
 *  <  > conveyor belts U  updraft (wind lifts you)
 *  p  plate -> opens D doors (while held)   k  plate -> opens K doors (while held)
 *  P  golden plate -> Q golden gate (all P pressed at once = opens forever)
 *  b  blue gate (only HIM passes)           g  pink gate (only HER passes)
 *  h  horizontal moving platform            u  lift (moves up)
 *  x  saw blade         y  saw moving down/up
 *  H  heart spot        T  sign             S  spawn   G  goal
 */
(function (global) {
  'use strict';
  const TILE = 32, CH = 16, PAD_TOP = 8, PAD_BOT = 8;

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const WORLDS = [
    { name: 'Blossom Meadow', theme: 'meadow', icon: '🌸', tip: null },
    { name: 'Whisperwood', theme: 'forest', icon: '🍄', tip: 'Mushrooms bounce you sky-high. Wooden planks can be jumped through from below. Wall too tall? Jump at it and hold ANCHOR to grab it — your partner can climb on your head!' },
    { name: 'Crystal Caverns', theme: 'cave', icon: '💎', tip: 'Spikes hurt! Cracked stones crumble a moment after you step on them. Pink gates only let HER through, blue gates only HIM.' },
    { name: 'Frostpeak', theme: 'snow', icon: '❄️', tip: 'Ice is slippery — and you cannot anchor on ice. Find solid ground before holding your partner!' },
    { name: 'Sunset Dunes', theme: 'desert', icon: '🌵', tip: 'Moving platforms carry you along. Conveyor belts push you around.' },
    { name: 'Ember Peak', theme: 'volcano', icon: '🌋', tip: 'Lava and saw blades send you both back to the last flag. Time your moves together!' },
    { name: 'Cloud Kingdom', theme: 'sky', icon: '☁️', tip: 'Warm updrafts lift you up — hold ANCHOR to sink through them. Lifts go up and down.' },
    { name: 'Clockwork Ruins', theme: 'ruins', icon: '⚙️', tip: 'Many plates, many doors. Talk it through: who stands where?' },
    { name: 'Starlit Night', theme: 'night', icon: '🌙', tip: 'It is dark! Stay close — your lanterns light the way.' },
    { name: 'Heart Summit', theme: 'summit', icon: '💖', tip: 'The final climb. Everything you learned, together.' },
  ];

  const NAMES = [
    ['First Steps', 'Petal Path', 'Hand in Hand', 'Sunny Hills', 'Daisy Drop', 'Bee Line', 'Clover Climb', 'Picnic Pass', 'Butterfly Bend', 'Rose Ridge'],
    ['Mossy Start', 'Mushroom Hop', 'Fern Gully', 'Owl Hollow', 'Bramble Bridge', 'Toadstool Tower', 'Firefly Lane', 'Acorn Ascent', 'Root Maze', 'Elder Oak'],
    ['Echo Entrance', 'Glimmer Gap', 'Amethyst Alley', 'Crumbly Crossing', 'Stalactite Steps', 'Gem Gallery', 'Pink & Blue', 'Quartz Quarry', 'Hollow Heart', 'Geode Gate'],
    ['Frosty Hello', 'Slippery Slope', 'Snowflake Steps', 'Icicle Inn', 'Polar Path', 'Blizzard Bend', 'Glacier Gap', 'Mitten Mile', 'Aurora Arch', 'Sled Summit'],
    ['Dune Dawn', 'Mirage Miles', 'Cactus Corner', 'Sandy Switch', 'Oasis Overpass', 'Scorpion Steps', 'Belt of Sand', 'Sunset Strip', 'Caravan Climb', 'Pyramid Peak'],
    ['Warm Welcome', 'Ember Edge', 'Magma March', 'Saw Song', 'Cinder Steps', 'Obsidian Pass', 'Ash Alley', 'Molten Moat', 'Forge Fall', 'Inferno Ridge'],
    ['Cloud Nine', 'Breezy Bounce', 'Updraft Avenue', 'Rainbow Run', 'Feather Fall', 'Stormy Steps', 'Sky Lift', 'Gale Gardens', 'Thunder Gate', "Heaven's Hall"],
    ['Old Gate', 'Cog Corridor', 'Gear Garden', 'Ancient Plates', 'Clocktower Climb', 'Rusty Riddle', 'Pendulum Pass', 'Lever Lane', 'Hourglass Hall', 'Timekeeper'],
    ['Moonrise', 'Lantern Lane', 'Starfall', 'Night Owls', 'Midnight Maze', 'Shadow Steps', 'Constellation', 'Comet Climb', 'Dreamwalk', 'Last Light'],
    ['Base Camp', 'Love Letters', 'Promise Path', 'Twin Peaks', 'Brave Hearts', 'Together Ridge', 'Thousand Steps', 'Forever Falls', 'Final Ascent', 'Heart Summit'],
  ];

  // style: grass | snow | sand | rock | brick | cloud | crystal
  const THEMES = {
    meadow: { sky: ['#ffc9de', '#fff3e6'], far: '#f5b3cc', mid: '#a7dc97', ground: '#9c6b45', groundDark: '#7b4f2f', top: '#79c95f', topLight: '#a6e58a', plank: '#c08a58', style: 'grass', sun: '#fff1a8', particle: 'petal', decor: ['flower', 'flower', 'tuft', 'tuft'], music: 0 },
    forest: { sky: ['#9fdcc3', '#eaf8df'], far: '#79bfa0', mid: '#3e8d64', ground: '#5e4535', groundDark: '#45322a', top: '#3fa14e', topLight: '#6fcd71', plank: '#9b6a42', style: 'grass', particle: 'firefly', decor: ['mushroom', 'tuft', 'fern', 'tuft'], music: 2 },
    cave: { sky: ['#1d1536', '#3b2b66'], far: '#33255a', mid: '#251a44', ground: '#5a4b7d', groundDark: '#41365e', top: '#9a86df', topLight: '#c8b9ff', plank: '#7a6a98', style: 'crystal', particle: 'sparkle', decor: ['crystal', 'crystal', 'pebble'], cave: true, music: 5 },
    snow: { sky: ['#b9defc', '#f3fbff'], far: '#dcecf8', mid: '#a9cfeb', ground: '#7895b5', groundDark: '#5b7695', top: '#ffffff', topLight: '#ffffff', plank: '#a07b5a', style: 'snow', sun: '#fffbe0', particle: 'snow', decor: ['pine', 'snowball', 'tuft2'], music: 7 },
    desert: { sky: ['#ff986b', '#ffd9a0'], far: '#f0a861', mid: '#d48848', ground: '#d6a06a', groundDark: '#b8834f', top: '#f3c98f', topLight: '#ffe3b5', plank: '#a8703f', style: 'sand', sun: '#fff0b0', particle: 'dust', decor: ['cactus', 'pebble', 'bones'], music: 3 },
    volcano: { sky: ['#2c0b12', '#8a2c18'], far: '#561c1a', mid: '#361112', ground: '#4b3633', groundDark: '#2e2120', top: '#6f4a3b', topLight: '#9c6a50', plank: '#5a3d32', style: 'rock', particle: 'ember', decor: ['pebble', 'vent', 'pebble'], music: 10 },
    sky: { sky: ['#86cdfd', '#eaf7ff'], far: '#ffffff', mid: '#d9efff', ground: '#e7eefb', groundDark: '#c3d2ea', top: '#ffffff', topLight: '#ffffff', plank: '#f5d58a', style: 'cloud', sun: '#fff8c8', particle: 'feather', decor: ['star', 'tuft2'], music: 9 },
    ruins: { sky: ['#cbb48b', '#f0e3c5'], far: '#ab9774', mid: '#8b7858', ground: '#8f8576', groundDark: '#6c6356', top: '#7fa36a', topLight: '#a2c88a', plank: '#8a6a45', style: 'brick', sun: '#fff3cf', particle: 'leaf', decor: ['column', 'tuft', 'gear'], music: 4 },
    night: { sky: ['#090d2a', '#232c5c'], far: '#1a2150', mid: '#11173a', ground: '#323a57', groundDark: '#222840', top: '#3f6d5b', topLight: '#64957d', plank: '#5b4a3a', style: 'grass', moon: true, particle: 'star', decor: ['glowflower', 'tuft', 'glowflower'], dark: true, music: 6 },
    summit: { sky: ['#ff9fc6', '#ffd9aa'], far: '#e993b6', mid: '#c46d99', ground: '#7f5b7c', groundDark: '#5f4261', top: '#ffe4f1', topLight: '#ffffff', plank: '#b07a8a', style: 'snow', sun: '#fff0d0', particle: 'heart', decor: ['heartflower', 'pine', 'tuft2'], music: 1 },
  };

  const CHUNKS = {};
  function def(id, world, diff, rows, o) {
    CHUNKS[id] = Object.assign({ id, world, diff, rows, mirror: true, move: {} }, o || {});
  }

  // ---------- special ----------
  def('start', 0, 0, [
    '......',
    '..S...',
    '######',
    '######',
  ], { special: true, mirror: false });
  def('end', 0, 0, [
    '............',
    '......G.....',
    '############',
    '############',
  ], { special: true, mirror: false });
  def('__tip', 0, 0, [
    '........',
    '.T......',
    '########',
    '########',
  ], { special: true, mirror: false });

  // ---------- tutorial ----------
  def('t_move', 0, 1, [
    '...........H..........',
    '......................',
    '......................',
    '.........####.........',
    '.......########.......',
    '.T...############.....',
    '######################',
    '######################',
  ], { special: true, mirror: false, sign: 'Move: A/D or ←/→ · Jump: W, ↑ or Space. You two are tied by a red string — wherever one goes, the other follows!' });
  def('t_anchor', 0, 1, [
    '...........H..........',
    '......................',
    '.T....................',
    '#########...##########',
    '#########...##########',
  ], { special: true, mirror: false, sign: 'Hold S / ↓ to ANCHOR. An anchored player holds the string tight if the other one slips. Hanging? Hold E (or Right-Shift) to climb the string, then JUMP off it onto the ledge!' });
  def('t_climb', 0, 2, [
    '..............H........',
    '.......................',
    '.........##########....',
    '.........##########....',
    '.........###########...',
    '.T.......############..',
    '#######################',
    '#######################',
  ], { special: true, mirror: false, sign: 'Too high? One stands still, the other jumps on their head! Then the top player ANCHORS (S/↓) while the other holds E to climb the string — and jumps off at the top.' });
  def('t_door', 0, 1, [
    '.........#..........',
    '.........#..........',
    '.........#..........',
    '.........#..........',
    '.........#..........',
    '.........#.....H....',
    '.........D..........',
    '.........D..........',
    '.T.p.....D.....p....',
    '####################',
    '####################',
  ], { special: true, mirror: false, sign: 'Plates open doors only while someone stands on them. One holds the door, the other goes through — then return the favour from the other side!' });
  def('t_twin', 0, 2, [
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '.......H..........#.....',
    '..................#.....',
    '..................#.....',
    '....P.....P.......#.....',
    '...###...###......Q.....',
    '..................Q.....',
    '.T................Q.....',
    '########################',
    '########################',
  ], { special: true, mirror: false, sign: 'Golden plates must be pressed at the SAME time. Then the golden gate opens forever.' });

  // ---------- world 0: Meadow ----------
  def('steps', 0, 1, [
    '...........H..........',
    '......................',
    '......................',
    '.........####.........',
    '.......########.......',
    '.....############.....',
    '######################',
    '######################',
  ]);
  def('gap', 0, 1, [
    '.........H..........',
    '....................',
    '....................',
    '########...#########',
    '########...#########',
  ]);
  def('pillars', 0, 1, [
    '..........H..........',
    '.....................',
    '...........##........',
    '......##...##...##...',
    '......##...##...##...',
    '#####################',
    '#####################',
  ]);
  def('door', 0, 1, [
    '.........#..........',
    '.........#..........',
    '.........#..........',
    '.........#..........',
    '.........#..........',
    '.........#.....H....',
    '.........D..........',
    '.........D..........',
    '...p.....D.....p....',
    '####################',
    '####################',
  ]);
  def('gap2', 0, 2, [
    '............H.........',
    '......................',
    '......................',
    '######...##....#######',
    '######...##....#######',
  ]);
  def('wall4', 0, 2, [
    '..............H........',
    '.......................',
    '.........##########....',
    '.........##########....',
    '.........###########...',
    '.........############..',
    '#######################',
    '#######################',
  ], { mirror: false });
  def('well', 0, 2, [
    '............#.........',
    '............#.........',
    '............#.........',
    '............#.........',
    '............#.........',
    '............#.........',
    '............#.........',
    '............D..H......',
    '............D.........',
    '............D.p.......',
    '.....####..#######....',
    '.....####..#######....',
    '....#####p.########...',
    '....###############...',
    '######################',
    '######################',
  ]);
  def('twin', 0, 2, [
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '.......H..........#.....',
    '..................#.....',
    '..................#.....',
    '....P.....P.......#.....',
    '...###...###......Q.....',
    '..................Q.....',
    '..................Q.....',
    '########################',
    '########################',
  ], { mirror: false });
  def('tower', 0, 3, [
    '............H.........',
    '......................',
    '........##########....',
    '........##########....',
    '........##########....',
    '........###########...',
    '......#############...',
    '........############..',
    '........############..',
    '######################',
    '######################',
  ], { mirror: false });

  // ---------- world 1: Forest ----------
  def('bounce', 1, 1, [
    '............H.........',
    '......................',
    '..........######......',
    '..........######......',
    '..........######......',
    '..........#######.....',
    '..........#######.....',
    '..........########....',
    '..........########....',
    '#######B##############',
    '######################',
  ], { mirror: false });
  def('oneway', 1, 1, [
    '..........H...........',
    '......................',
    '........======........',
    '......................',
    '......................',
    '...=====......=====...',
    '......................',
    '......................',
    '........======........',
    '......................',
    '......................',
    '######################',
    '######################',
  ]);
  def('bridge', 1, 2, [
    '..........H...........',
    '......................',
    '.......====..===......',
    '......................',
    '######..........######',
    '######..........######',
  ]);
  def('mushroom_hop', 1, 2, [
    '.........H..........',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '....................',
    '#####B^^^^^^########',
    '####################',
  ], { mirror: false });
  def('bounce_gap', 1, 2, [
    '............H...........',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '.........BB.............',
    '.........##.............',
    '######...##......#######',
    '######...##......#######',
  ], { mirror: false });
  def('highwall', 1, 4, [
    '...........H........',
    '....................',
    '........#######.....',
    '........#######.....',
    '........########....',
    '........########....',
    '........#########...',
    '........#########...',
    '####################',
    '####################',
  ], { mirror: false });

  // ---------- world 2: Caves ----------
  def('spikes', 2, 2, [
    '..........H...........',
    '......................',
    '......###...###.......',
    '......................',
    '####^^^^^^^^^^^^^^####',
    '######################',
  ]);
  def('crumble', 2, 2, [
    '..........H...........',
    '......................',
    '......................',
    '######CCCCCCCCCC######',
    '######..........######',
  ]);
  def('gate_pink', 2, 2, [
    '............#.......',
    '............#.......',
    '............#.......',
    '............#.......',
    '............#.......',
    '............#.......',
    '....#######.#.......',
    '....g.....#.#.......',
    '....g.H...#.#.......',
    '....g.....#.#.......',
    '....g....p#.#.......',
    '....#######.D.......',
    '............D.......',
    '............D.p.....',
    '####################',
    '####################',
  ], { mirror: false });
  def('gate_blue', 2, 2, [
    '............#.......',
    '............#.......',
    '............#.......',
    '............#.......',
    '............#.......',
    '............#.......',
    '....#######.#.......',
    '....b.....#.#.......',
    '....b.H...#.#.......',
    '....b.....#.#.......',
    '....b....p#.#.......',
    '....#######.D.......',
    '............D.......',
    '............D.p.....',
    '####################',
    '####################',
  ], { mirror: false });
  def('crumble_stairs', 2, 3, [
    '..........H.............',
    '........................',
    '.........CC.............',
    '........................',
    '.....CC.......CC........',
    '........................',
    '####^^^^^^^^^^^^^^^^####',
    '########################',
  ], { mirror: false });
  def('spike_pillars', 2, 3, [
    '.........H..............',
    '........................',
    '.........##.............',
    '.........##...###.......',
    '....##...##...###...##..',
    '....##...##...###...##..',
    '######^^^##^^^###^^^####',
    '########################',
  ]);
  def('spike_wall', 2, 4, [
    '............H...........',
    '........................',
    '........##########......',
    '........##########......',
    '........###########.....',
    '........############....',
    '######^^################',
    '########################',
  ], { mirror: false });

  // ---------- world 3: Snow ----------
  def('ice', 3, 2, [
    '.............H............',
    '..........................',
    '..........................',
    '####IIIII^^IIII^^IIIII####',
    '##########################',
  ]);
  def('ice_gap', 3, 2, [
    '.........H............',
    '......................',
    '......................',
    '####...IIII....#######',
    '####...IIII....#######',
  ]);
  def('ice_steps', 3, 3, [
    '..........H.............',
    '........................',
    '........IIIIII..........',
    '........IIIIII..........',
    '....IIIIIIIIIIIII.......',
    '....IIIIIIIIIIIII.......',
    '#################^^^####',
    '########################',
  ]);
  def('ice_wall', 3, 4, [
    '...........H..........',
    '......................',
    '........IIII######....',
    '........IIII######....',
    '........IIII#######...',
    '........IIII########..',
    '######################',
    '######################',
  ], { mirror: false });

  // ---------- world 4: Desert ----------
  def('moving_h', 4, 2, [
    '...........H............',
    '........................',
    '........................',
    '......hhh...............',
    '#####.............######',
    '#####.............######',
  ], { move: { h: 6 } });
  def('conveyor', 4, 2, [
    '...........H............',
    '........................',
    '........................',
    '####<<<<<^^^<<<<<<^^^###',
    '########################',
  ]);
  def('moving_h2', 4, 3, [
    '.................H..........',
    '............................',
    '............................',
    '..............hhh...........',
    '............................',
    '.....hhh....................',
    '####....................####',
    '####....................####',
  ], { move: { h: 5 } });
  def('conveyor_up', 4, 3, [
    '...........H............',
    '........................',
    '..........>>>>..........',
    '........................',
    '.....<<<<......<<<<.....',
    '........................',
    '####^^^^^^^^^^^^^^^^####',
    '########################',
  ]);
  def('lift', 4, 2, [
    '...........H..........',
    '......................',
    '..........#######.....',
    '..........#######.....',
    '..........#######.....',
    '..........#######.....',
    '..........#######.....',
    '..........########....',
    '........uu########....',
    '######################',
    '######################',
  ], { mirror: false, move: { u: 6 } });

  // ---------- world 5: Volcano ----------
  def('lava', 5, 2, [
    '...........H............',
    '........................',
    '......##...##...##......',
    '####~~##~~~##~~~##~~####',
    '########################',
  ]);
  def('saw_run', 5, 2, [
    '............H.........',
    '......................',
    '......................',
    '.......x....x....x....',
    '######################',
    '######################',
  ]);
  def('saws', 5, 3, [
    '.........y..............',
    '............H...........',
    '........................',
    '........................',
    '...............x...x....',
    '########################',
    '########################',
  ], { move: { y: 4 } });
  def('lava_moving', 5, 3, [
    '.................H..........',
    '............................',
    '............................',
    '..............hhh...........',
    '.....hhh....................',
    '####~~~~~~~~~~~~~~~~~~~~####',
    '############################',
  ], { move: { h: 5 } });

  // ---------- world 6: Sky ----------
  def('updraft', 6, 2, [
    '............H.............',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '.........UUUUUUUU.........',
    '#####....UUUUUUUU....#####',
    '#####....UUUUUUUU....#####',
  ]);
  def('updraft_climb', 6, 3, [
    '.......UUU............',
    '.......UUU.H..........',
    '.......UUU#######.....',
    '.......UUU#######.....',
    '.......UUU#######.....',
    '.......UUU#######.....',
    '.......UUU#######.....',
    '.......UUU#######.....',
    '.......UUU#######.....',
    '.......UUU########....',
    '.......UUU########....',
    '######################',
    '######################',
  ], { mirror: false });
  def('lava_lift', 6, 4, [
    '............H...........',
    '........................',
    '...........====.........',
    '........................',
    '........................',
    '........................',
    '......uuu...............',
    '####~~~~~~~~~~~~~~~~####',
    '########################',
  ], { move: { u: 5 } });

  // ---------- world 7: Ruins ----------
  def('door_maze', 7, 3, [
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#.....#.......',
    '......#..H..#.......',
    '......D.....K.......',
    '......D.....K.......',
    '...p..D.pk..K.k.....',
    '####################',
    '####################',
  ]);
  def('twin_spikes', 7, 4, [
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '..................#.....',
    '.......H..........#.....',
    '..................#.....',
    '..................#.....',
    '....P.....P.......#.....',
    '...###...###......Q.....',
    '..................Q.....',
    '..................Q.....',
    '####^^^^^^^^^^^^^#######',
    '########################',
  ], { mirror: false });

  // ---------- world 9: Summit ----------
  def('gauntlet', 9, 5, [
    '..................y.........',
    '............................',
    '..........H.................',
    '............................',
    '.........CCC................',
    '..............CCC...........',
    '....CCC.............CCC.....',
    '............................',
    '####~~~~~~~~~~~~~~~~~~~~####',
    '############################',
  ], { move: { y: 5 } });

  const TUTORIAL = {
    1: ['t_move', 't_anchor', 'pillars'],
    2: ['t_climb', 'gap2', 'steps'],
    3: ['t_door', 't_twin'],
  };

  const SOLIDISH = '#IB<>';

  function prepRows(c, mirror) {
    const w = c.rows[0].length;
    let rows = c.rows.slice();
    while (rows.length < CH) rows.unshift('.'.repeat(w));
    if (mirror) rows = rows.map(r => r.split('').reverse().map(ch => ch === '<' ? '>' : ch === '>' ? '<' : ch).join(''));
    return rows;
  }

  function pickSequence(n, R) {
    if (TUTORIAL[n]) return TUTORIAL[n].map(id => ({ id, mirror: false }));
    const wi = Math.floor((n - 1) / 10), local = (n - 1) % 10;
    const out = [];
    if (local === 0 && WORLDS[wi].tip) out.push({ id: '__tip', mirror: false });
    const count = 3 + Math.floor(local / 3) + Math.floor(wi / 2);
    const maxD = Math.min(5, 1 + Math.floor(wi / 2) + Math.floor(local / 4));
    const minD = Math.max(1, maxD - 2);
    const all = Object.values(CHUNKS).filter(c => !c.special && c.world <= wi);
    let pool = all.filter(c => c.diff <= maxD && c.diff >= minD);
    if (pool.length < 3) pool = all.filter(c => c.diff <= maxD);
    const used = new Set();
    const chosen = [];
    let prev = null;
    for (let k = 0; k < count; k++) {
      let cands = pool.filter(c => !used.has(c.id));
      if (!cands.length) { used.clear(); cands = pool.filter(c => c.id !== prev); }
      if (!cands.length) cands = pool;
      const weights = cands.map(c => (c.world === wi ? 6 : (wi - c.world <= 2 ? 2.5 : 1)) * (c.diff === maxD ? 1.6 : 1));
      let sum = weights.reduce((a, b) => a + b, 0), r = R() * sum, idx = 0;
      while (idx < cands.length - 1 && r >= weights[idx]) { r -= weights[idx]; idx++; }
      const c = cands[idx];
      used.add(c.id); prev = c.id;
      chosen.push({ id: c.id, mirror: c.mirror && R() < 0.5, d: c.diff + R() * 0.9 });
    }
    // gentle difficulty ramp inside a level
    chosen.sort((a, b) => a.d - b.d);
    return out.concat(chosen.map(c => ({ id: c.id, mirror: c.mirror })));
  }

  function buildLevel(n) {
    n = Math.max(1, Math.min(100, n | 0));
    const wi = Math.floor((n - 1) / 10), local = (n - 1) % 10;
    const world = WORLDS[wi], theme = THEMES[world.theme];
    const R = mulberry(n * 7919 + 101);
    const seq = [{ id: 'start', mirror: false }].concat(pickSequence(n, R), [{ id: 'end', mirror: false }]);
    const H = PAD_TOP + CH + PAD_BOT;
    let W = 0;
    const prepared = seq.map(s => {
      const c = CHUNKS[s.id];
      const rows = prepRows(c, s.mirror);
      const r = { c, rows, mirror: s.mirror, x0: W };
      W += rows[0].length;
      return r;
    });
    const grid = [];
    for (let y = 0; y < H; y++) grid.push(new Array(W).fill('.'));
    const L = {
      n, wi, local, world, theme, themeKey: world.theme, name: NAMES[wi][local], W, H, grid,
      spawn: null, goal: null, checkpoints: [], heartSpots: [], hearts: [], plates: [], doorGroup: {},
      groups: {}, movers: [], saws: [], signs: [], dark: !!theme.dark, chunks: seq.map(s => s.id + (s.mirror ? '*' : '')),
    };
    prepared.forEach((pc, ci) => {
      const { c, rows, x0 } = pc;
      const cw = rows[0].length;
      const mv = c.move || {};
      let moverK = 0;
      for (let ry = 0; ry < CH; ry++) {
        const gy = PAD_TOP + ry, row = rows[ry];
        for (let rx = 0; rx < cw; rx++) {
          let ch = row[rx];
          const gx = x0 + rx, px = gx * TILE, py = gy * TILE;
          switch (ch) {
            case 'S': L.spawn = { x: px + TILE / 2, y: py + TILE }; ch = '.'; break;
            case 'G': L.goal = { x: px + TILE / 2, y: py + TILE, rect: { x: px - 2 * TILE, y: py - 3 * TILE, w: 5 * TILE, h: 4 * TILE } }; ch = '.'; break;
            case 'H': L.heartSpots.push({ x: px + TILE / 2, y: py + TILE / 2 }); ch = '.'; break;
            case 'T': L.signs.push({ x: px + TILE / 2, y: py + TILE, text: c.id === '__tip' ? world.tip : (c.sign || ''), key: c.id === '__tip' ? 'tip:' + wi : c.id }); ch = '.'; break;
            case 'p': case 'k': case 'P': {
              const kind = ch === 'P' ? 'latch' : 'any';
              const g = ci + ':' + (ch === 'p' ? 'a' : ch === 'k' ? 'b' : 'L');
              L.groups[g] = L.groups[g] || { kind, plates: [] };
              const plate = { x: px, y: py, group: g, kind, down: false };
              L.plates.push(plate); L.groups[g].plates.push(plate);
              ch = '.'; break;
            }
            case 'D': case 'K': case 'Q': {
              const g = ci + ':' + (ch === 'D' ? 'a' : ch === 'K' ? 'b' : 'L');
              L.doorGroup[gy * W + gx] = g;
              if (!L.groups[g]) L.groups[g] = { kind: ch === 'Q' ? 'latch' : 'any', plates: [] };
              break;
            }
            case 'h': case 'u': {
              if (rx > 0 && row[rx - 1] === ch) { ch = '.'; break; }
              let len = 1;
              while (rx + len < cw && row[rx + len] === ch) len++;
              const amp = ch === 'h' ? (mv.h || 4) * (pc.mirror ? -1 : 1) : -(mv.u || 4);
              const period = Math.max(2.6, Math.abs(amp) * Math.PI / 3.0);
              L.movers.push({ x0: px, y0: py, x: px, y: py, w: len * TILE, h: 12, ax: ch === 'h' ? amp : 0, ay: ch === 'u' ? amp : 0, period, phase: moverK * 0.5, dx: 0, dy: 0 });
              moverK++; ch = '.'; break;
            }
            case 'x': L.saws.push({ x0: px + 16, y0: py + 16, x: px + 16, y: py + 16, ay: 0, period: 1, phase: 0, r: 13 }); ch = '.'; break;
            case 'y': {
              const amp = mv.y || 4;
              L.saws.push({ x0: px + 16, y0: py + 16, x: px + 16, y: py + 16, ay: amp, period: Math.max(2, amp * Math.PI / 2.6), phase: 0, r: 13 });
              ch = '.'; break;
            }
          }
          grid[gy][gx] = ch;
        }
      }
      for (let rx = 0; rx < cw; rx++) {
        const b = rows[CH - 1][rx];
        const fill = (SOLIDISH.includes(b) || b === '~') ? '#' : '.';
        for (let y = PAD_TOP + CH; y < H; y++) grid[y][x0 + rx] = fill;
      }
      if (ci >= 2 && ci < prepared.length - 1) {
        const gx = x0 + 1, gy = PAD_TOP + 13;
        if (grid[gy][gx] === '.' && '#I'.includes(grid[gy + 1][gx])) L.checkpoints.push({ x: gx * TILE + TILE / 2, y: (gy + 1) * TILE });
      }
    });
    L.checkpoints.unshift({ x: L.spawn.x, y: L.spawn.y });
    const spots = L.heartSpots.slice();
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    L.hearts = spots.slice(0, 3).sort((a, b) => a.x - b.x).map(s => ({ x: s.x, y: s.y, taken: false }));
    // decorations on exposed ground
    L.decor = [];
    const DR = mulberry(n * 31 + 7);
    for (let y = PAD_TOP; y < PAD_TOP + CH; y++) for (let x = 0; x < W; x++) {
      if (grid[y][x] === '#' && grid[y - 1][x] === '.' && DR() < 0.3) {
        L.decor.push({ x: x * TILE + 6 + DR() * 20, y: y * TILE, type: theme.decor[Math.floor(DR() * theme.decor.length)], v: DR() });
      }
    }
    return L;
  }

  global.HS = { TILE, CH, PAD_TOP, PAD_BOT, WORLDS, THEMES, NAMES, CHUNKS, buildLevel, mulberry, LEVELS: 100 };
})(typeof window !== 'undefined' ? window : globalThis);
