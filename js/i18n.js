/* Heartstring — English / Türkçe translations. */
(function (global) {
  'use strict';
  const KEY = 'heartstring.lang';

  const EN = {
    'title': 'Heartstring — a co-op climb for two',
    'menu.tagline': 'Two hearts · one red string · a hundred climbs',
    'menu.name': 'Your name', 'menu.namePh': 'e.g. Alex',
    'menu.host': '💌 Create a room', 'menu.join': '🔑 Join with a code', 'menu.local': '🎮 Two players, one keyboard', 'menu.help': 'How to play',
    'join.title': 'Join your partner', 'join.sub': 'Enter the 5-letter room code they sent you.', 'join.go': 'Join 💞', 'back': 'Back',
    'join.invite': 'Invite found! Type your name on the main menu if you like, then press Join.',
    'join.short': 'Room codes have 5 characters.', 'join.connecting': 'Connecting…',
    'lobby.code': 'Room code', 'lobby.copyCode': 'Copy code', 'lobby.copyLink': 'Copy invite link', 'lobby.waiting': 'Waiting for your partner…',
    'lobby.who': "Who's who?", 'lobby.whoSub': "Click a character to make it Player 1's.", 'lobby.leave': 'Leave',
    'lobby.choose': 'Choose a level →', 'lobby.openMap': 'Open level map →', 'char.boy': 'Him', 'char.girl': 'Her',
    'lobby.creating': 'Creating your room…', 'lobby.send': 'Send this code (or the invite link) to your partner. Waiting for them to join…',
    'lobby.connected': 'Connected! Pick your character 💞', 'lobby.joined': 'Your partner joined! Pick your characters 💞',
    'lobby.rejoin': 'Waiting for your partner to re-join with the same code…', 'lobby.fail': 'Could not create the room: {msg}',
    'lobby.bothPick': 'Both players pick a character to continue.', 'lobby.ready': 'Ready! {who} is here 💞', 'lobby.readyAnon': 'Ready! Your partner is here 💞',
    'lobby.you': 'You', 'lobby.partner': 'Partner', 'lobby.pick': 'Click to pick', 'lobby.p1': 'Player 1 · WASD + E', 'lobby.p2': 'Player 2 · Arrows + R-Shift',
    'toast.codeCopied': 'Code copied!', 'toast.linkCopied': 'Invite link copied — send it to your partner!', 'toast.disc': 'Your partner disconnected 💔',
    'toast.noPeer': 'Online library failed to load. Check your internet connection and refresh.', 'toast.taken': 'Your partner already picked that one.',
    'toast.full': 'That room already has two players.', 'toast.needChars': 'Both players need a character first.', 'toast.conn': 'Connection problem.',
    'net.timeout': 'Could not reach the room. Check the code and try again.', 'net.notFound': 'Room not found. Is the code right, and is your partner still on the lobby screen?',
    'map.lobby': '← Lobby', 'map.continue': 'Continue ▶', 'map.play': 'Play stage {n} ▶', 'map.stats': '{done}/100 stages cleared · {hearts} hearts collected',
    'map.noteHost': 'Every stage is open — pick any one and you both jump in.', 'map.noteGuest': 'Every stage is open — pick one and you will both start there.',
    'map.noteLocal': 'Every stage is open — start anywhere, any time. Progress is saved in this browser.',
    'hud.music': 'Music', 'hud.sfx': 'Sound effects', 'hud.menu': 'Menu (Esc)', 'hud.lang': 'Language',
    'hint.online': 'Move A/D ←/→ · Jump W/↑/Space · Anchor S/↓ · Climb E · Kiss K 💋 · Dance Z 💃 · Matcha X 🍵 · İskender V 🥙 · Shine G ✨ (her) · Sweet words 5-9 · Chat Enter',
    'hint.local': 'P1: WASD · E climb · F kiss · Z dance · X matcha · V İskender · G shine · C sweet words   |   P2: Arrows · R-Shift climb · L kiss · N dance · M matcha · K İskender · I shine · J sweet words',
    'pause.title': 'Taking a breather', 'pause.resume': 'Resume', 'pause.restart': 'Restart stage', 'pause.map': 'Level map', 'pause.controls': 'Controls', 'pause.quit': 'Quit to main menu',
    'pause.online': 'The world keeps moving online — Restart and Level Map affect both of you.', 'pause.local': 'Game paused.',
    'win.next': 'Next stage →', 'win.replay': 'Replay', 'win.map': 'Level map', 'win.either': 'Either of you can pick what is next.',
    'win.msgs': ['Perfect teamwork!', 'You two are unstoppable!', 'Hearts in sync 💞', 'What a duo!', 'Love conquers all (even spikes)!', 'Better together!', 'Sweetest climbers ever!', 'Two hearts, one beat 💓'],
    'win.final': 'You reached the Heart Summit! 💖', 'win.time': 'time', 'win.best': ' · best!', 'win.restarts': 'restarts', 'win.stage': 'stage',
    'help.title': 'How to play', 'help.sub': 'You are tied together by a red string. Nobody gets home alone — both of you must reach the heart arch.',
    'help.online': 'Online (each on your own computer)', 'help.local': 'Same keyboard', 'help.tricks': 'Tricks', 'help.fun': 'Just for fun 💕', 'help.ok': 'Got it!',
    'help.onlineKeys': '<li><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> move</li><li><kbd>W</kbd> / <kbd>↑</kbd> / <kbd>Space</kbd> jump (hold = higher)</li><li><kbd>S</kbd> / <kbd>↓</kbd> <b>hold to anchor</b></li><li><kbd>E</kbd> / <kbd>Q</kbd> <b>hold to climb / pull the string</b></li><li><kbd>1</kbd>–<kbd>4</kbd> emotes ❤️ 👋 ✋ ⬆️</li><li><kbd>K</kbd> kiss 💋 (stand right next to each other)</li>',
    'help.localKeys': '<li>P1: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · climb <kbd>E</kbd> · kiss <kbd>F</kbd> · emotes <kbd>1</kbd>–<kbd>4</kbd></li><li>P2: <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> · climb <kbd>R-Shift</kbd> or <kbd>/</kbd> · kiss <kbd>L</kbd> · emotes <kbd>7</kbd>–<kbd>0</kbd></li>',
    'help.funKeys': '<li><kbd>Z</kbd> dance 💃 · <kbd>X</kbd> sip strawberry matcha 🍓🍵 (while standing still)</li><li><kbd>5</kbd>–<kbd>9</kbd> sweet words: "I love you so much" and more 💕</li><li><kbd>Enter</kbd> chat — your message pops up in a heart above your head</li><li><kbd>V</kbd> eat İskender kebab 🥙 · <kbd>G</kbd> (her) light up his face ✨</li><li>Same keyboard: P1 <kbd>Z</kbd> <kbd>X</kbd> <kbd>V</kbd> <kbd>G</kbd> <kbd>C</kbd> · P2 <kbd>N</kbd> <kbd>M</kbd> <kbd>K</kbd> <kbd>I</kbd> <kbd>J</kbd></li>',
    'help.tips': '<li>🪨 <b>Anchor</b> on solid ground to hold your partner when they fall.</li><li>🧗 Hold <b>climb</b> to shorten the string and pull yourself up to an anchored partner.</li><li>🧍 Stand on your partner\'s head to reach high ledges.</li><li>🧱 Jump at a wall and hold anchor to <b>grab it</b> — make yourself a step for your partner.</li><li>🚩 Flags save your spot. If one of you falls, you both go back.</li>',
    'help.legend': '<span><i class="sw teal"></i>Plate opens door while held</span><span><i class="sw gold"></i>Golden plates: press together</span><span><i class="sw pink"></i>Pink gate: only Her</span><span><i class="sw blue"></i>Blue gate: only Him</span><span>❄️ No anchoring on ice</span>',
    'chat.ph': 'Say something sweet… (Enter)', 'chat.send': 'Send', 'chat.who': 'Who is talking?', 'chat.dance': '💃 Dance', 'chat.matcha': '🍵 Matcha', 'chat.eat': '🥙 İskender', 'chat.shine': '✨ Shine',
    'emotes': ['❤️', '👋 Here!', '✋ Wait!', '⬆️ Jump!'],
    'phrases': ['I love you so much 💕', "You're my everything ✨", 'Come here, kiss me 😘', "You're amazing! 🌟", "Don't ever let go 🫶"],
    'chips': ['💕 Love you', '✨ My everything', '😘 Kiss me', '🌟 Amazing', '🫶 Never let go'],
    'act.matcha': 'Drinking strawberry matcha 🍓🍵', 'act.eat': 'Eating İskender 🥙😋', 'act.shine': 'Shine bright, my love ✨', 'act.dance': '💃 ♪',
    'game.you': 'You', 'game.partner': 'Partner', 'game.p1': 'P1 · WASD', 'game.p2': 'P2 · Arrows', 'game.kissOnline': '💋 Press K', 'game.kissLocal': '💋 F / L',
    'game.stageOf': '{world} · Stage {n} of 100',
  };

  const TR = {
    'title': 'Heartstring — iki kişilik kalp tırmanışı',
    'menu.tagline': 'İki kalp · tek kırmızı ip · yüz tırmanış',
    'menu.name': 'Adın', 'menu.namePh': 'ör. Ayşe',
    'menu.host': '💌 Oda oluştur', 'menu.join': '🔑 Kodla katıl', 'menu.local': '🎮 Tek klavyede iki kişi', 'menu.help': 'Nasıl oynanır',
    'join.title': 'Sevgiline katıl', 'join.sub': 'Sana gönderdiği 5 harfli oda kodunu yaz.', 'join.go': 'Katıl 💞', 'back': 'Geri',
    'join.invite': 'Davet bulundu! İstersen ana menüde adını yaz, sonra Katıl\'a bas.',
    'join.short': 'Oda kodu 5 karakterdir.', 'join.connecting': 'Bağlanıyor…',
    'lobby.code': 'Oda kodu', 'lobby.copyCode': 'Kodu kopyala', 'lobby.copyLink': 'Davet linkini kopyala', 'lobby.waiting': 'Sevgilin bekleniyor…',
    'lobby.who': 'Kim kim?', 'lobby.whoSub': '1. Oyuncu olmak istediğin karaktere tıkla.', 'lobby.leave': 'Ayrıl',
    'lobby.choose': 'Bölüm seç →', 'lobby.openMap': 'Haritayı aç →', 'char.boy': 'Erkek', 'char.girl': 'Kız',
    'lobby.creating': 'Odan oluşturuluyor…', 'lobby.send': 'Bu kodu (ya da davet linkini) sevgiline gönder. Katılması bekleniyor…',
    'lobby.connected': 'Bağlandın! Karakterini seç 💞', 'lobby.joined': 'Sevgilin katıldı! Karakterlerinizi seçin 💞',
    'lobby.rejoin': 'Sevgilinin aynı kodla tekrar katılması bekleniyor…', 'lobby.fail': 'Oda oluşturulamadı: {msg}',
    'lobby.bothPick': 'Devam etmek için ikiniz de karakter seçin.', 'lobby.ready': 'Hazır! {who} burada 💞', 'lobby.readyAnon': 'Hazır! Sevgilin burada 💞',
    'lobby.you': 'Sen', 'lobby.partner': 'Sevgilin', 'lobby.pick': 'Seçmek için tıkla', 'lobby.p1': '1. Oyuncu · WASD + E', 'lobby.p2': '2. Oyuncu · Oklar + Sağ Shift',
    'toast.codeCopied': 'Kod kopyalandı!', 'toast.linkCopied': 'Davet linki kopyalandı — sevgiline gönder!', 'toast.disc': 'Sevgilinin bağlantısı koptu 💔',
    'toast.noPeer': 'Çevrimiçi kütüphane yüklenemedi. İnternet bağlantını kontrol edip sayfayı yenile.', 'toast.taken': 'Sevgilin onu zaten seçti.',
    'toast.full': 'Bu odada zaten iki oyuncu var.', 'toast.needChars': 'Önce iki oyuncunun da karakter seçmesi gerek.', 'toast.conn': 'Bağlantı sorunu.',
    'net.timeout': 'Odaya ulaşılamadı. Kodu kontrol edip tekrar dene.', 'net.notFound': 'Oda bulunamadı. Kod doğru mu, sevgilin hâlâ lobi ekranında mı?',
    'map.lobby': '← Lobi', 'map.continue': 'Devam ▶', 'map.play': '{n}. bölümü oyna ▶', 'map.stats': '{done}/100 bölüm bitti · {hearts} kalp toplandı',
    'map.noteHost': 'Tüm bölümler açık — birini seç, ikiniz birlikte başlayın.', 'map.noteGuest': 'Tüm bölümler açık — birini seç, ikiniz de oradan başlarsınız.',
    'map.noteLocal': 'Tüm bölümler açık — istediğin yerden başla. İlerleme bu tarayıcıda kaydedilir.',
    'hud.music': 'Müzik', 'hud.sfx': 'Ses efektleri', 'hud.menu': 'Menü (Esc)', 'hud.lang': 'Dil',
    'hint.online': 'Hareket A/D ←/→ · Zıpla W/↑/Boşluk · Tutun S/↓ · Tırman E · Öp K 💋 · Dans Z 💃 · Matcha X 🍵 · İskender V 🥙 · Işık G ✨ (kız) · Tatlı sözler 5-9 · Sohbet Enter',
    'hint.local': '1.O: WASD · E tırman · F öp · Z dans · X matcha · V İskender · G ışık · C tatlı söz   |   2.O: Oklar · Sağ Shift tırman · L öp · N dans · M matcha · K İskender · I ışık · J tatlı söz',
    'pause.title': 'Biraz soluklanalım', 'pause.resume': 'Devam et', 'pause.restart': 'Bölümü yeniden başlat', 'pause.map': 'Bölüm haritası', 'pause.controls': 'Kontroller', 'pause.quit': 'Ana menüye dön',
    'pause.online': 'Çevrimiçi dünya akmaya devam ediyor — Yeniden Başlat ve Harita ikinizi de etkiler.', 'pause.local': 'Oyun duraklatıldı.',
    'win.next': 'Sonraki bölüm →', 'win.replay': 'Tekrar oyna', 'win.map': 'Bölüm haritası', 'win.either': 'Sıradakini ikiniz de seçebilirsiniz.',
    'win.msgs': ['Mükemmel takım!', 'Siz ikiniz durdurulamazsınız!', 'Kalpler aynı ritimde 💞', 'Ne ikili ama!', 'Aşk her şeyi yener (dikenleri bile)!', 'Birlikte daha güzel!', 'Dünyanın en tatlı tırmanıcıları!', 'İki kalp, tek atış 💓'],
    'win.final': 'Kalp Zirvesi\'ne ulaştınız! 💖', 'win.time': 'süre', 'win.best': ' · rekor!', 'win.restarts': 'yeniden', 'win.stage': 'bölüm',
    'help.title': 'Nasıl oynanır', 'help.sub': 'Birbirinize kırmızı bir iple bağlısınız. Kimse eve tek başına dönmez — ikiniz de kalp kemerine ulaşmalısınız.',
    'help.online': 'Çevrimiçi (herkes kendi bilgisayarında)', 'help.local': 'Aynı klavye', 'help.tricks': 'Püf noktaları', 'help.fun': 'Sadece eğlence için 💕', 'help.ok': 'Anladım!',
    'help.onlineKeys': '<li><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> hareket</li><li><kbd>W</kbd> / <kbd>↑</kbd> / <kbd>Boşluk</kbd> zıpla (basılı tut = daha yüksek)</li><li><kbd>S</kbd> / <kbd>↓</kbd> <b>basılı tut: tutun</b></li><li><kbd>E</kbd> / <kbd>Q</kbd> <b>basılı tut: ipe tırman / ipi çek</b></li><li><kbd>1</kbd>–<kbd>4</kbd> ifadeler ❤️ 👋 ✋ ⬆️</li><li><kbd>K</kbd> öpücük 💋 (yan yana durun)</li>',
    'help.localKeys': '<li>1.O: <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> · tırman <kbd>E</kbd> · öp <kbd>F</kbd> · ifadeler <kbd>1</kbd>–<kbd>4</kbd></li><li>2.O: <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> · tırman <kbd>Sağ Shift</kbd> ya da <kbd>/</kbd> · öp <kbd>L</kbd> · ifadeler <kbd>7</kbd>–<kbd>0</kbd></li>',
    'help.funKeys': '<li><kbd>Z</kbd> dans 💃 · <kbd>X</kbd> çilekli matcha iç 🍓🍵 (dururken)</li><li><kbd>5</kbd>–<kbd>9</kbd> tatlı sözler: "Seni çok seviyorum" ve dahası 💕</li><li><kbd>Enter</kbd> sohbet — mesajın başının üstünde kalp içinde çıkar</li><li><kbd>V</kbd> İskender ye 🥙 · <kbd>G</kbd> (kız) erkeğin yüzüne ışık saç ✨</li><li>Aynı klavye: 1.O <kbd>Z</kbd> <kbd>X</kbd> <kbd>V</kbd> <kbd>G</kbd> <kbd>C</kbd> · 2.O <kbd>N</kbd> <kbd>M</kbd> <kbd>K</kbd> <kbd>I</kbd> <kbd>J</kbd></li>',
    'help.tips': '<li>🪨 Sevgilin düşerken onu tutmak için sağlam zeminde <b>tutun</b>.</li><li>🧗 <b>Tırman</b> tuşunu basılı tutarak ipi kısalt ve tutunan sevgiline doğru kendini çek.</li><li>🧍 Yüksek çıkıntılara ulaşmak için sevgilinin kafasına çık.</li><li>🧱 Duvara zıpla ve tutun tuşuyla <b>duvara yapış</b> — sevgiline basamak ol.</li><li>🚩 Bayraklar yerinizi kaydeder. Biriniz düşerse ikiniz de geri dönersiniz.</li>',
    'help.legend': '<span><i class="sw teal"></i>Plaka basılıyken kapı açılır</span><span><i class="sw gold"></i>Altın plakalar: aynı anda basın</span><span><i class="sw pink"></i>Pembe kapı: sadece kız</span><span><i class="sw blue"></i>Mavi kapı: sadece erkek</span><span>❄️ Buzda tutunulmaz</span>',
    'chat.ph': 'Tatlı bir şey yaz… (Enter)', 'chat.send': 'Gönder', 'chat.who': 'Kim konuşuyor?', 'chat.dance': '💃 Dans', 'chat.matcha': '🍵 Matcha', 'chat.eat': '🥙 İskender', 'chat.shine': '✨ Işık saç',
    'emotes': ['❤️', '👋 Buradayım!', '✋ Bekle!', '⬆️ Zıpla!'],
    'phrases': ['Seni çok seviyorum 💕', 'Sen benim her şeyimsin ✨', 'Gel buraya, öp beni 😘', 'Harikasın! 🌟', 'Beni hiç bırakma 🫶'],
    'chips': ['💕 Seni seviyorum', '✨ Her şeyimsin', '😘 Öp beni', '🌟 Harikasın', '🫶 Bırakma beni'],
    'act.matcha': 'Çilekli matcha içiyorum 🍓🍵', 'act.eat': 'İskender yiyorum 🥙😋', 'act.shine': 'Parla sevgilim ✨', 'act.dance': '💃 ♪',
    'game.you': 'Sen', 'game.partner': 'Sevgilin', 'game.p1': '1.O · WASD', 'game.p2': '2.O · Oklar', 'game.kissOnline': '💋 K\'ye bas', 'game.kissLocal': '💋 F / L',
    'game.stageOf': '{world} · Bölüm {n} / 100',
  };

  const TR_WORLDS = [
    { name: 'Çiçek Çayırı', tip: null },
    { name: 'Fısıltı Ormanı', tip: 'Mantarlar sizi gökyüzüne zıplatır. Tahta platformlardan alttan zıplayarak geçebilirsiniz. Duvar çok mu yüksek? Duvara zıpla ve TUTUN tuşunu basılı tut — sevgilin kafana çıkabilir!' },
    { name: 'Kristal Mağaralar', tip: 'Dikenler acıtır! Çatlak taşlar üstüne bastıktan kısa süre sonra ufalanır. Pembe kapılardan sadece KIZ, mavi kapılardan sadece ERKEK geçer.' },
    { name: 'Ayaz Doruğu', tip: 'Buz kaygandır — ve buzda tutunamazsın. Sevgilini tutmadan önce sağlam zemin bul!' },
    { name: 'Gün Batımı Kumulları', tip: 'Hareketli platformlar sizi taşır. Yürüyen bantlar sizi iter.' },
    { name: 'Kor Dağı', tip: 'Lav ve testereler ikinizi de son bayrağa geri gönderir. Hareketlerinizi birlikte zamanlayın!' },
    { name: 'Bulut Krallığı', tip: 'Sıcak hava akımları sizi yukarı kaldırır — içinden aşağı inmek için TUTUN tuşunu basılı tutun. Asansörler iner çıkar.' },
    { name: 'Saat İşi Harabeler', tip: 'Bir sürü plaka, bir sürü kapı. Konuşun: kim nerede duracak?' },
    { name: 'Yıldızlı Gece', tip: 'Hava karanlık! Yakın durun — fenerleriniz yolu aydınlatır.' },
    { name: 'Kalp Zirvesi', tip: 'Son tırmanış. Öğrendiğiniz her şey, birlikte.' },
  ];
  const TR_NAMES = [
    ['İlk Adımlar', 'Yaprak Yolu', 'El Ele', 'Güneşli Tepeler', 'Papatya Düşüşü', 'Arı Hattı', 'Yonca Tırmanışı', 'Piknik Geçidi', 'Kelebek Kıvrımı', 'Gül Sırtı'],
    ['Yosunlu Başlangıç', 'Mantar Zıplayışı', 'Eğrelti Vadisi', 'Baykuş Kovuğu', 'Böğürtlen Köprüsü', 'Mantar Kulesi', 'Ateşböceği Sokağı', 'Meşe Palamudu Yokuşu', 'Kök Labirenti', 'Yaşlı Meşe'],
    ['Yankı Girişi', 'Pırıltı Boşluğu', 'Ametist Sokağı', 'Ufalanan Geçit', 'Sarkıt Basamakları', 'Mücevher Galerisi', 'Pembe & Mavi', 'Kuvars Ocağı', 'Kovuk Kalp', 'Geode Kapısı'],
    ['Ayazlı Merhaba', 'Kaygan Yokuş', 'Kar Tanesi Basamakları', 'Buz Saçağı Hanı', 'Kutup Yolu', 'Tipi Virajı', 'Buzul Boşluğu', 'Eldiven Mili', 'Kutup Işığı Kemeri', 'Kızak Zirvesi'],
    ['Kumul Şafağı', 'Serap Milleri', 'Kaktüs Köşesi', 'Kumlu Makas', 'Vaha Üstgeçidi', 'Akrep Basamakları', 'Kum Kuşağı', 'Gün Batımı Şeridi', 'Kervan Tırmanışı', 'Piramit Zirvesi'],
    ['Sıcak Karşılama', 'Kor Kıyısı', 'Magma Yürüyüşü', 'Testere Şarkısı', 'Kül Basamakları', 'Obsidyen Geçidi', 'Kül Sokağı', 'Erimiş Hendek', 'Demirhane Düşüşü', 'Cehennem Sırtı'],
    ['Yedinci Kat', 'Esintili Zıplayış', 'Hava Akımı Caddesi', 'Gökkuşağı Koşusu', 'Tüy Düşüşü', 'Fırtınalı Basamaklar', 'Gök Asansörü', 'Rüzgâr Bahçeleri', 'Gök Gürültüsü Kapısı', 'Cennet Salonu'],
    ['Eski Kapı', 'Dişli Koridoru', 'Çark Bahçesi', 'Kadim Plakalar', 'Saat Kulesi Tırmanışı', 'Paslı Bilmece', 'Sarkaç Geçidi', 'Kol Sokağı', 'Kum Saati Salonu', 'Zaman Bekçisi'],
    ['Ay Doğuşu', 'Fener Sokağı', 'Yıldız Yağmuru', 'Gece Kuşları', 'Gece Yarısı Labirenti', 'Gölge Basamakları', 'Takımyıldız', 'Kuyruklu Yıldız Tırmanışı', 'Rüya Yürüyüşü', 'Son Işık'],
    ['Ana Kamp', 'Aşk Mektupları', 'Söz Yolu', 'İkiz Tepeler', 'Cesur Kalpler', 'Birlikte Sırtı', 'Bin Basamak', 'Sonsuzluk Şelalesi', 'Son Tırmanış', 'Kalp Zirvesi'],
  ];
  const TR_SIGNS = {
    t_move: 'Hareket: A/D ya da ←/→ · Zıpla: W, ↑ ya da Boşluk. İkiniz kırmızı bir iple bağlısınız — biri nereye giderse diğeri de gelir!',
    t_anchor: 'TUTUNMAK için S / ↓ basılı tut. Tutunan oyuncu, diğeri kayarsa ipi sımsıkı tutar. Sallanıyor musun? İpe tırmanmak için E (ya da Sağ Shift) basılı tut, sonra ipten çıkıntıya ZIPLA!',
    t_climb: 'Çok mu yüksek? Biri dursun, diğeri onun kafasına zıplasın! Sonra üstteki TUTUNSUN (S/↓), diğeri E ile ipe tırmansın — ve tepede zıplasın.',
    t_door: 'Plakalar sadece üstlerinde biri dururken kapıları açar. Biri kapıyı tutsun, diğeri geçsin — sonra öbür taraftan iyiliğe karşılık verin!',
    t_twin: 'Altın plakalara AYNI ANDA basılmalı. O zaman altın kapı sonsuza dek açılır.',
  };

  function detect() {
    try { const s = localStorage.getItem(KEY); if (s === 'en' || s === 'tr') return s; } catch (e) { /* ignore */ }
    const n = (global.navigator && (navigator.language || '')).toLowerCase();
    return n.startsWith('tr') ? 'tr' : 'en';
  }

  const I18N = {
    lang: detect(),
    listeners: [],
    dict() { return this.lang === 'tr' ? TR : EN; },
    t(key, vars) {
      let s = this.dict()[key];
      if (s === undefined) s = EN[key];
      if (s === undefined) return key;
      if (typeof s === 'string' && vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
      return s;
    },
    worldName(wi) { const w = global.HS && HS.WORLDS[wi]; return this.lang === 'tr' && TR_WORLDS[wi] ? TR_WORLDS[wi].name : (w ? w.name : ''); },
    worldTip(wi) { const w = global.HS && HS.WORLDS[wi]; return this.lang === 'tr' && TR_WORLDS[wi] ? TR_WORLDS[wi].tip : (w ? w.tip : ''); },
    levelName(wi, i) { return this.lang === 'tr' && TR_NAMES[wi] ? TR_NAMES[wi][i] : (global.HS ? HS.NAMES[wi][i] : ''); },
    sign(key, fallback) {
      if (!key) return fallback;
      if (key.startsWith('tip:')) return this.worldTip(+key.slice(4)) || fallback;
      return (this.lang === 'tr' && TR_SIGNS[key]) || fallback;
    },
    set(lang) {
      if (lang !== 'en' && lang !== 'tr') return;
      this.lang = lang;
      try { localStorage.setItem(KEY, lang); } catch (e) { /* ignore */ }
      this.apply();
      this.listeners.forEach(fn => { try { fn(lang); } catch (e) { /* ignore */ } });
    },
    toggle() { this.set(this.lang === 'tr' ? 'en' : 'tr'); },
    onChange(fn) { this.listeners.push(fn); },
    apply(root) {
      root = root || document;
      document.documentElement.lang = this.lang;
      document.title = this.t('title');
      root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = this.t(el.dataset.i18n); });
      root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = this.t(el.dataset.i18nHtml); });
      root.querySelectorAll('[data-i18n-ph]').forEach(el => { el.placeholder = this.t(el.dataset.i18nPh); });
      root.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = this.t(el.dataset.i18nTitle); });
      root.querySelectorAll('.lang-btn').forEach(el => { el.innerHTML = this.lang === 'tr' ? '<b>TR</b>·EN' : 'TR·<b>EN</b>'; });
    },
  };
  global.I18N = I18N;
})(typeof window !== 'undefined' ? window : globalThis);
