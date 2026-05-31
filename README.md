# GreyNet

Offline network designer (CAD-style) for laying out infrastructure across four scales — a single site, a city, the planet, and orbit. Runs as a Windows desktop app on Electron.

## Views

- **Local** — devices, security zones, and links inside one site (routers, switches, firewalls, servers, endpoints, etc.).
- **City** — endpoints placed on a real map. Backends: OpenStreetMap, Google Maps (BYO API key), or an offline image.
- **Planet** — sites pinned by lat/lng on a world map with inter-site links. Optional live overlay: city lights, plane tracks, satellite passes.
- **Space** — orbital assets (LEO / MEO / GEO / deep space) with coverage cones and inter-satellite links.
- **Deep Space** — interplanetary **Link Budget Studio**. Heliocentric solar-system view with live planet positions (simplified Standish ephemeris). Pick a transmit station (DSN 70m, Estrack 35m, Starship LEO, Mars relay, Lunar Gateway), pick a target (Mercury…Neptune, Moon, JWST, Voyager 1), slide TX power / antenna gain / frequency / data rate / noise temp / modulation+FEC, and watch FSPL, C/N₀, achieved vs required Eb/N₀, **link margin**, Shannon capacity bound, and one-way light delay update live. Built-in scenario presets: DSN ↔ MRO, Voyager 1 today, Apollo S-band, JWST Ka, hypothetical Mars Starlink, New Horizons to Pluto orbit.

Each view has its own palette; switch from the toolbar.

## Running

Requires Node.js (any LTS).

```powershell
.\run.bat
```

…or directly:

```powershell
npm install
npm start
```

## Building

```powershell
.\build.bat
```

Produces a portable `.exe` and an NSIS installer under `dist/`. See [`package.json`](package.json) for the underlying `electron-builder` targets.

## Features

- Drag-and-drop device palette (routing, security, servers, endpoints, external).
- Security zones (Internet / DMZ / Internal / Management / Guest).
- Link types: Ethernet, Fiber, Wireless, VPN tunnel, Trunk (LACP).
- Auto-connect: heuristically wires up missing likely links.
- Vulnerability scan + graded report (duplicate IPs/MACs, exposed devices, cross-zone links without inspection, etc.).
- Exports: PNG / SVG diagram, HTML security report, HTML technical specs, CSV cost estimate.
- JSON save/load; autosaves to `localStorage` every 5 seconds.
- Optional **Ask AI** — describe what to build and an LLM populates the diagram. Bring your own Anthropic or OpenAI key.

## Keyboard

| Key | Action |
|---|---|
| `V` / `C` | Select / Connect mode |
| `Esc` | Cancel / deselect |
| `Del` | Delete selection |
| `Ctrl+D` | Duplicate |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+A` | Select all |
| `Ctrl+S` / `Ctrl+O` | Save / Open JSON |
| `Alt+drag` or middle-drag | Pan |
| Wheel | Zoom |
| `+` / `-` / `0` / `F` | Zoom in / out / reset / fit |
| `G` | Toggle grid |

## API Keys

Settings (toolbar `⚙`) stores keys for:

- **Anthropic** or **OpenAI** — for the Ask AI feature.
- **Google Maps** — for the city-view Maps backend (OpenStreetMap works without a key).

Keys are encrypted at rest by the Electron main process using OS-backed `safeStorage`. The renderer only sees presence flags. Details in [SECURITY.md](SECURITY.md).

## Optional World Image

Drop a night-Earth photo as `worldmap.jpg` (or `.png` / `.webp`) in the project root for a photographic planet backdrop. Without it, the Planet view falls back to a vector globe.

## License

UNLICENSED — see [`package.json`](package.json).
