# Contributing to Pit Wall

Thanks for your interest! Pit Wall is a small, dependency-free project, so
getting started is quick.

## Setup

```bash
git clone https://github.com/<you>/pitwall.git
cd pitwall
npm start          # runs in sample mode, no token needed
npm test           # unit tests
```

Requires **Node ≥ 18**. There is no build step and no runtime dependencies.

## Ways to help

- **Add a provider adapter** (Jira, Linear, GitHub Issues, …). This is the most
  valuable contribution. Copy `src/providers/jira.js`, implement the `Provider`
  interface from `src/providers/base.js`, register it in
  `src/providers/index.js`, and add a test alongside `test/query.test.js`.
- **Improve the dashboard** in `public/` (vanilla JS/CSS, no framework).
- **Refine metric definitions** in `src/metrics.js`.

## Pull requests

- Keep the zero-dependency philosophy — prefer Node built-ins.
- Run `npm test` before opening a PR; add tests for query translation logic.
- Use clear, conventional commit messages (see below).
- Never commit secrets. Tokens come from env vars only; `config.json` and
  `.env` are git-ignored.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(providers): add Linear adapter
fix(server): handle missing connection id
docs: clarify token setup
```

## Reporting bugs

Open an issue using the bug report template. Include your Node version, the
provider you're using, and steps to reproduce.
