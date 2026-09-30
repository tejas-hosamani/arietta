# Arietta

A fast, modern web interface for [aria2](https://github.com/aria2/aria2).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshots/tasks-dark.png">
  <img alt="Arietta task list" src="docs/screenshots/tasks-light.png">
</picture>

| | |
|---|---|
| ![Task files](docs/screenshots/task-files-dark.png) | ![Task peers](docs/screenshots/task-peers-light.png) |
| ![New download](docs/screenshots/new-download-dark.png) | ![Preferences](docs/screenshots/preferences-light.png) |

Light and dark versions of every screenshot are in [`docs/screenshots`](docs/screenshots).

## Download

1. Start aria2 with RPC enabled:
   ```sh
   aria2c --enable-rpc --rpc-listen-all --rpc-allow-origin-all
   ```
2. Download [`arietta.html`](https://github.com/tejas-hosamani/arietta/releases/latest/download/arietta.html) and open it in your browser. It is a single self-contained file, no server or install needed.

Arietta connects to `ws://localhost:6800/jsonrpc` by default. Change the server or add more under Preferences.

To host it on a web server instead, use the `arietta-*-web.zip` from the [latest release](https://github.com/tejas-hosamani/arietta/releases/latest).

## Stack

- Vite, React 19, TypeScript (strict)
- Tailwind CSS v4, Radix UI primitives, lucide icons, Geist fonts
- TanStack Query for polling and cache invalidation, zustand for persisted settings
- wouter with hash routing, so the build works from any static host or `file://`

## Features

- WebSocket (with push events) or HTTP POST/GET JSON-RPC, secret token, custom headers
- Multiple aria2 servers, switchable from the sidebar
- Task lists: downloading, queued, finished, all. Search, sort, multi-select (shift-click, Ctrl/Cmd+A), bulk pause/resume/remove, queue reordering, retry of failed HTTP/FTP tasks
- Task detail: progress, speeds, file tree with BitTorrent file selection, piece map, peers with client detection, trackers, sources, per-task options
- New download dialog: multiple links, mirrors, magnets, `.torrent` / `.metalink` files (picker or drop anywhere on the window), paste a link anywhere to start
- Full aria2 global options editor, grouped and searchable, with validation
- Server status: version, features, session, save session, shut down
- Light, dark and system themes, compact density, live speed sparkline, window title template, desktop notifications on completion or failure
- Settings import/export

Not ported from the original (yet): translations (English only), the URL command line API, drag-and-drop task reordering (move up/down is available), per-task speed charts.

## Development

```sh
npm install
npm run dev
```

Start aria2 with RPC enabled, for example:

```sh
aria2c --enable-rpc --rpc-listen-all --rpc-allow-origin-all
```

No aria2 handy? `npm run mock` starts a fake aria2 on port 6800 with sample downloads that progress, seed, and send WebSocket events.

## Build

```sh
npm run build            # dist/ for a web server
npm run build:allinone   # dist-allinone/index.html, a single self-contained file
```

Other scripts: `npm run typecheck`, `npm run lint`.

## Credits

Arietta started as a rewrite of [AriaNg](https://github.com/mayswind/AriaNg) by MaysWind, and its feature set follows AriaNg closely. The code is new, but the aria2 option metadata, error descriptions and file type groups in `src/lib/aria2/data.json` come from AriaNg. Thank you to MaysWind and the AriaNg contributors.

## License

MIT. See [LICENSE](LICENSE), which keeps the original AriaNg copyright notice.
