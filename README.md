# Heartstring 

A cozy, physics-based 2-player co-op platformer where two players are tied together by a red string. Built with vanilla JavaScript, HTML5 Canvas, and WebRTC.

Play online across two browsers or locally on a single keyboard.

---

## Highlights

- **String Physics**: Two players connected by a taut, elastic rope. Anchor yourself down (`S` / `Down`), swing across chasms, or reel in the line (`E` / `/`).
- **Co-op Mechanics**: Carry each other, bounce on your partner's head, solve switches, ride updrafts, and reach the glowing goal together.
- **Serverless Online Play**: Instant peer-to-peer connection via WebRTC (PeerJS). No accounts, backend databases, or servers to configure—just share a 5-letter code or invite link.
- **Same-Keyboard Co-op**: Play side-by-side on one computer with dedicated split keybindings.
- **Zero Build Tools**: 100% vanilla web stack (Canvas 2D, Web Audio API, ES6). No npm, webpack, or bundler needed.
- **Bilingual**: Built-in support for English and Turkish.

---

## How to Run & Implement

Because the game uses WebRTC and asset scripts, you must serve it over HTTP/HTTPS rather than opening `index.html` as a `file://` URL (which browsers block for security).

### 1. Run Locally

Open the project folder in your terminal and run any static server:

```bash
# Using Python 3
python3 -m http.server 3000

# Or using Node.js
npx serve .

# Or using PHP
php -S localhost:3000
```

Then visit `http://localhost:3000` in your browser.

> **Tip for testing online mode locally:** Open two separate browser windows (or an incognito window), create a room in one, and enter the 5-letter room code in the other.

---

### 2. Deploy to the Web

Since this is a purely static site, deployment takes 30 seconds:

- **GitHub Pages**: Push this repo to GitHub, go to **Settings > Pages**, choose `main` branch and `/ (root)` folder, then save.
- **Vercel / Netlify / Cloudflare Pages**: Connect your repository or drag-and-drop the folder. Leave the build command blank and set the publish directory to `.`.

---

### 3. Self-Hosting PeerJS Signaling (Optional)

By default, `js/net.js` uses the public PeerJS cloud server (`0.peerjs.com`) for room discovery and WebRTC handshake. If you prefer to host your own signaling server for lower latency or a private network:

1. Install and run [peerjs-server](https://github.com/peers/peerjs-server):
   ```bash
   npx peer -p 9000
   ```
2. In `js/net.js`, add your server config to the `new global.Peer(...)` calls:
   ```javascript
   const peer = new global.Peer(id, {
     host: 'localhost', // or your server domain
     port: 9000,
     path: '/myapp'
   });
   ```

---

## Controls

### Basic Movement & Physics

| Action | Online (Solo Controls) | Local P1 (Left) | Local P2 (Right) |
|---|---|---|---|
| **Move** | `A` / `D` or `←` / `→` | `A` / `D` | `←` / `→` |
| **Jump** | `W`, `Space`, or `↑` | `W` or `Space` | `↑` |
| **Anchor** (plant feet) | `S` or `↓` | `S` | `↓` |
| **Reel In String** | `E` or `Q` | `E` | `Shift` or `/` |

### Interactions & Emotes

- **Kiss**: `F` (P1) / `L` (P2)
- **Dance**: `Z` (P1) / `N` (P2)
- **Matcha / Sip**: `X` (P1) / `M` (P2)
- **Snack**: `V` (P1) / `K` (P2)
- **Cheer / Sparkle**: `G` (P1) / `I` (P2)
- **Emotes**: Number keys `1`–`4` (P1) / `7`–`0` (P2)

---

## Project Structure

```text
├── index.html        # Game layout, menus, HUD, and modals
├── css/
│   └── style.css     # Styling, animations, and responsive canvas wrapper
└── js/
    ├── game.js       # Game engine, physics solver, rope simulation & render loop
    ├── net.js        # WebRTC P2P networking via PeerJS
    ├── levels.js     # Tilemaps, hazards, checkpoints, and level definitions
    ├── ui.js         # Menu navigation, lobby state, and HUD updates
    ├── audio.js      # Procedural sound effects via Web Audio API
    └── i18n.js       # English & Turkish translations
```

---

## License

MIT
