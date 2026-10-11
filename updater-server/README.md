# GuEarth Update Server

Optional deployment. Since the client resolves the installer digest itself from the GitHub
releases API (see the updater contract in `AGENTS.md`), updates already work against the stock
hazel instance and this server is not required. Deploying it only saves the client one API
round-trip per update check by attaching `sha256` to the manifest server-side. A single
zero-dependency serverless function answers the updater contract implemented in
`src/main/updater.ts`:

- `GET /update/win32/:version` returns `200` with the manifest
  `{ name, notes, pub_date, url, sha256 }`, or `204` when there is nothing to offer.
- `sha256` comes from the GitHub release asset `digest` field, computed by GitHub at upload time.
  A release asset without a digest produces a manifest without `sha256`, which the client treats
  as "no update" (fail closed).
- Version comparison stays client-side, matching the previous hazel behavior.
- Non-win32 platforms and any failure to load release data respond `204`.

## Deploy on Vercel

1. In Vercel, create a project from this repository with **Root Directory** set to
   `updater-server` (or run `vercel` from inside this directory).
2. Environment variables:
   - `GITHUB_REPO` — optional, defaults to `Proj-Pigeon/GuEarth`.
   - `GITHUB_TOKEN` — recommended. Any token with no scopes works for a public repository and
     lifts the GitHub API rate limit from 60 to 5000 requests/hour. Edge caching
     (`s-maxage=300`) amortizes the remaining calls.
3. Attach the domain `guearth-updater.isla.fan` to this project and detach it from the old hazel
   deployment. The old instance still points at the pre-transfer slug `HikaruQwQ/GuEarth` and only
   works through GitHub's transfer redirect.

## Verify

```bash
curl -s https://guearth-updater.isla.fan/update/win32/0.1.12
curl -s -o /dev/null -w "%{http_code}\n" https://guearth-updater.isla.fan/update/darwin/0.1.12
```

The first response must include a `sha256` field matching the digest shown for the installer
asset in the GitHub release; the second must return `204`. Then start the packaged app on an
older version and confirm the update dialog appears.
