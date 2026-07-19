# 🏁 Pit Wall

**A provider-agnostic QA telemetry dashboard — your ticketing metrics, F1 broadcast style.**

Plug in your own ticketing platform (Shortcut today; Jira and others via a small
adapter) and watch your QA workflow like a race: a **Timing Tower** of live
metrics and a **Telemetry Feed** of the stories behind each number.

> Runs locally, zero runtime dependencies, and your API tokens never leave your
> machine. Starts in **sample mode** so you can see it before connecting anything.

---

## Quick start

Two ways to run it — a **desktop app** or a **local web server**.

### Desktop app (its own window)

```bash
git clone https://github.com/<you>/pitwall.git
cd pitwall
npm install      # one-time: fetches Electron
npm run app      # opens the Pit Wall window
```

`npm run dist` builds a double-clickable app into `dist/`.

### Web (zero dependencies)

```bash
npm start        # → http://localhost:4200
```

No token and no `npm install` needed for web mode (Node ≥ 18 only). Either way
you'll see the dashboard with sample data first; connect your platform to go
live.

## Go live with your data

Just click **Connect your platform** on the dashboard (or open
`http://localhost:4200/onboard.html`). The guided flow walks you through it:

1. **Choose your platform** (Shortcut today; more via adapters).
2. **Paste your API token** — there's a link to where you get it.
3. **Test connection** — confirms it works and shows who you're connected as.
4. **Pick your tiles** — see [Configuring your tiles](#configuring-your-tiles).

That's it — no files to edit. Your connection is saved to `config.json` and your
token to `.secrets.json` (perms `600`), both **git-ignored and local to your
machine**. The token never touches `config.json` and is never committed.

> **Advanced / CI:** instead of the UI, you can declare a connection in
> `config.json` (copy `config.example.json`) and supply its token via the env var
> named in `tokenEnv` (see `.env.example`). An env var, when set, wins over the
> stored secret.

## What it shows

| Tile | Meaning (default definition) |
|------|------------------------------|
| **Ready for QA** | Stories you own, in a *Ready for QA* state |
| **In Testing** | Stories you own, currently in testing |
| **Bugs Reported** | Bugs you filed, active in the window |
| **In Dev** | Stories you own, in development |
| **New Defect** | Bugs you filed, *created* in the window |
| **Test Cases Created** | Test-case stories you authored |
| **Tested** | Stories you own that reached *Tested* / *Deployed* |

These are **starter defaults**. Every tile is really a small config object —
which statuses to count, whether it's scoped to you or the whole team, and so on
— so tiles adapt to *your* workflow instead of assuming specific status names.

### Configuring your tiles

Your platform's real statuses drive the tiles. The server exposes:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/states?c=<connection>` | Every status on the connected platform (with a suggested category) — so you can pick which ones to track |
| `GET /api/settings?c=<connection>` | Your saved tiles for that connection (or the starter defaults) |
| `POST /api/settings?c=<connection>` | Save your tiles `{ tiles: [...], scopeDefault }` |

Saved tiles live in `settings.json` — **git-ignored and local**, like your token.
A tile is defined in [`src/metrics.js`](src/metrics.js) (`Tile`): a label, colour,
`scope` (`me`/`team`), `role` (`owner`/`requester`), the `states` to group, an
optional `type`/`text`, and how the time window applies (`bound`). A browser
picker to build these visually is the next milestone.

## Architecture

```
src/
├── server.js          Zero-dep HTTP server: serves public/ + a small JSON API
├── config.js          Loads connections; resolves tokens from env vars
├── metrics.js         Provider-agnostic metric definitions (the tiles)
├── snapshot.js        Runs each metric through a provider → normalized snapshot
└── providers/
    ├── base.js        The Provider interface + normalized data shapes
    ├── shortcut.js    Shortcut adapter (reference implementation)
    ├── jira.js        Jira adapter (skeleton — see TODOs)
    └── index.js       Provider registry
public/                Vanilla-JS frontend (dashboard, settings, onboarding)
data/sample.json       Bundled sample snapshot (sample mode)
electron/main.cjs      Optional desktop shell (boots the server, opens a window)
```

The rest of the app only ever speaks the **normalized shapes** in
[`src/providers/base.js`](src/providers/base.js) — it never touches a vendor API
directly. That's what makes it provider-agnostic.

### Add a new platform

1. Create `src/providers/yourplatform.js` extending `Provider` (copy `jira.js`).
2. Implement `getViewer`, `listStates`, `searchIssues`, `getIssue`, `issueUrl`.
   The one real task is translating a normalized `MetricQuery` into your API's
   query language (see `toShortcutDSL` / `toJQL` for worked examples).
3. Register it in `src/providers/index.js`.

## Development

```bash
npm run dev     # start with --watch (auto-restart on changes)
npm test        # run the unit tests (node:test)
```

## Roadmap

- [x] Config-driven tiles: read platform statuses, save per-connection tile setups
- [x] Settings UI — pick/group statuses into tiles from the browser (`/settings.html`)
- [x] First-run onboarding — connect a platform from the browser (`/onboard.html`)
- [x] Desktop app — Electron shell (`npm run app`) with packaging (`npm run dist`)
- [ ] Finish the Jira adapter; add Linear and GitHub Issues
- [ ] Manage multiple connections / switch between them in the UI
- [ ] Port the richer views from the v1 prototype (pace/lap analytics, the
      multi-agent "Paddock" review chat, the "Garage" test runner)
- [ ] Optional Electron desktop shell

## License

[MIT](LICENSE)
