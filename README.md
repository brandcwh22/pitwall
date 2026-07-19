# 🏁 Pit Wall

**A provider-agnostic QA telemetry dashboard — your ticketing metrics, F1 broadcast style.**

Plug in your own ticketing platform (Shortcut today; Jira and others via a small
adapter) and watch your QA workflow like a race: a **Timing Tower** of live
metrics and a **Telemetry Feed** of the stories behind each number.

> Runs locally, zero runtime dependencies, and your API tokens never leave your
> machine. Starts in **sample mode** so you can see it before connecting anything.

---

## Quick start

```bash
git clone https://github.com/<you>/pitwall.git
cd pitwall
npm start
```

Open **http://localhost:4200** — you'll see the dashboard populated with sample
data. No token, no `npm install` needed (Node ≥ 18).

## Go live with your data

1. **Copy the config template** (it's git-ignored, so your setup stays local):
   ```bash
   cp config.example.json config.json
   ```
2. **Get an API token** for your platform
   ([Shortcut](https://app.shortcut.com/settings/account/api-tokens)).
3. **Set the token** as the env var your connection names (`tokenEnv`):
   ```bash
   cp .env.example .env
   # edit .env → PITWALL_TOKEN_PRIMARY=your_token_here
   ```
4. **Restart** — `npm start`. Pit Wall now shows your real QA metrics.

Tokens are read from **environment variables only** and are never written to
`config.json` or committed. See [`.env.example`](.env.example).

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

Metrics are defined once, provider-neutrally, in
[`src/metrics.js`](src/metrics.js) — edit the labels, colours, or filters to fit
your workflow.

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
public/                Vanilla-JS frontend (Timing Tower + Telemetry Feed)
data/sample.json       Bundled sample snapshot (sample mode)
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

- [ ] Finish the Jira adapter; add Linear and GitHub Issues
- [ ] First-run onboarding UI (add a connection from the browser)
- [ ] Port the richer views from the v1 prototype (pace/lap analytics, the
      multi-agent "Paddock" review chat, the "Garage" test runner)
- [ ] Optional Electron desktop shell

## License

[MIT](LICENSE)
