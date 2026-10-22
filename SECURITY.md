# Security

## Incident Report — October 22, 2026

### Summary

The repository `richardokonicha/mentorassistance` was compromised with a
crypto-mining / command-and-control (C2) payload delivered through poisoned
files disguised as legitimate project assets. The compromise was discovered
during a routine `git push` when `origin/main` had been force-updated to a
malicious commit (`9e7f32b`) that was a sibling of the local `main` tip.

### Payload Description

The attack used two execution vectors:

1. **`api.js`** (root) — A 16,674-character Ethereum mainnet cryptominer/C2
   loader. It queried public Ethereum RPC endpoints to find the latest
   transaction from a hardcoded sender address (`0x1eef0849eda15d87f64e51c73c8442cf3c8bcef3`),
   decoded the recipient address into two C2 IP addresses, fetched stage-2
   payloads from `http://<ip>:443/0x/cls` and `/0x/ls`, and spawned a detached
   Node.js process (`child_process.spawn` with `detached: true`,
   `windowsHide: true`). The remote `package.json` build script was modified to
   run `node api.js && npm run build:all`.

2. **`public/fonts/fa-solid-400.woff2`** (and variants `fa-solid.lfk`,
   `fa-solid-300.llf`) — A 34,693-byte second-stage payload using the same C2
   infrastructure but a different sender address
   (`0xa322e5f3d311d3080e6f0121063e9adc2490ef1a`). The `.vscode/tasks.json`
   file contained a task labelled `eslint-check` with `"runOn": "folderOpen"`
   that executed `node ./public/fonts/fa-solid-400.woff2` automatically when
   the folder was opened in VS Code. These files were never genuine fonts —
   `fa-solid-400.woff2` does not exist in any FontAwesome release (FA6 uses
   `fa-solid-900`).

The `.lfk` and `api.js` payloads decoded to **byte-identical** source
(sha256 `85f1406a86decd1d27e7c351200791c1d6eb69e956b6aff534fdd562145f227a`).

### Affected Files (Removed)

| File | Size | Status |
|------|------|--------|
| `api.js` | 16,674 bytes | Deleted from all history |
| `public/fonts/fa-solid.lfk` | 12,797 bytes | Deleted from all history |
| `public/fonts/fa-solid-300.llf` | — | Deleted from all history |
| `public/fonts/fa-solid-400.woff2` | 34,693 bytes | Deleted from all history (local only) |

### Remediation Steps Performed

1. **Local cleanup** — Deleted the poisoned font file, neutralized the malicious
   `eslint-check` task in `.vscode/tasks.json` (replaced with a `typecheck`
   task), and removed `node api.js &&` from the build script.

2. **History rewrite** — Cloned a fresh mirror and ran `git filter-repo` with
   `--invert-paths` to remove all four payload files from every commit on every
   branch and `refs/pull/*`. A blob callback also rewrote `package.json` and
   `.vscode/tasks.json` in every historical commit. Result: zero malware
   signatures across all 65 blobs.

3. **Force-push** — All four branches (`main`, `clean-release`, `imgbot`,
   `dependabot/npm_and_yarn/source-map-js-1.2.2`) and all `refs/pull/*` refs
   were force-pushed to the cleaned history. `refs/pull/1/head` was re-pointed
   to a clean, non-infected ancestry commit via a PR reopen/re-close cycle.

4. **Local object store purge** — Expired all reflogs and ran `git gc
   --prune=now --aggressive` to remove all dangling infected objects. The
   known infected blob `6df5b2c9c172d3b822494c3ef9083dbfc135ecf6` (the local
   `fa-solid-400.woff2` variant) is no longer present in the object store.

5. **Upstream verification** — A fresh mirror clone of the live remote was
   scanned: 120 blobs across 7 refs, zero malware signatures, zero payload
   file paths, and the infected blob is absent from the object store entirely.

### Secret Rotation

The following secrets were in use and should be considered compromised (the
repository was public and the payload could have exfiltrated environment
variables):

- `KILO_API_KEY` — used for the Kilo Gateway LLM provider
- `GEMINI_API_KEY` — used for the Gemini provider
- `GROQ_API_KEY` — used for the Groq provider
- `OPENROUTER_API_KEY` — referenced in earlier provider migration docs
- `MINDSHUB_API_KEY` — referenced in `.env.local`

**Action required:** Rotate all of the above keys at their respective providers.
No secrets were found committed in the repository's git history (all were
loaded from `.env.local`, which is gitignored).

### Additional Recommendations

- **GitHub account review** — The attacker force-pushed `origin/main` on
  2026-10-22 11:18 +0100, minutes before this session. Review the account's
  security log for unauthorized access, SSH keys, and OAuth app authorizations.
- **GitHub Support** — Request full object-store garbage collection on the
  remote to ensure the unreachable infected blob
  (`6df5b2c9c172d3b822494c3ef9083dbfc135ecf6`) is purged from GitHub's
  servers. As of the last check, it was still fetchable via the blob API
  (HTTP 200) but returned 404 via `raw.githubusercontent.com`.
- **Dependency audit** — Run `npm audit` and review all installed packages for
  supply-chain compromise.
- **Machine scan** — Although no miner processes, persistence mechanisms, or
  global npm packages were found during the investigation, a full system scan
  is recommended given the payload's capabilities.

### Verification

The following checks pass on the current `main` branch:

- `npm run typecheck` — clean (no errors)
- `npm run build` — succeeds
- `test_prompt_contract.js` — PASS
- `test_codementor_alerts.js` — PASS
- `test_output_shaping.js` — PASS
- Working tree is clean and in sync with `origin/main`
- Zero malware signatures across all blobs on all refs
- No payload files present on any ref
- No dangling infected objects in the local object store
