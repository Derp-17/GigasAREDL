# Gigas Challenge List — platform foundation

This repository already contains the AREDL-inspired static website and its existing cache-refresh Worker. The new application API is intentionally isolated under `platform-worker/` so the current site and refresh service are not overwritten.

## Current scaffold

- `platform-worker/src/index.js`: minimal read-only API with health and level-list endpoints.
- `platform-worker/wrangler.toml`: separate Cloudflare Worker configuration.
- `platform-worker/migrations/0001_initial.sql`: D1 tables for player profiles, moderator roles, levels, record submissions, accepted records, and moderation audit history.

The existing public pages (including level and profile pages) are not yet connected to player accounts or the new database. Existing local completion tracking and public AREDL records are separate from authenticated submissions.

## Create the D1 database

From the repository root:

```bash
npx wrangler d1 create gigas-challenge-list
```

Copy the returned database ID into `platform-worker/wrangler.toml`, replacing `REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID`.

Set `SITE_ORIGIN` to the exact origin of the deployed website (scheme + hostname, no trailing path).

Apply the migration locally:

```bash
npx wrangler d1 migrations apply gigas-challenge-list --local --config platform-worker/wrangler.toml
```

Apply it to the remote database after checking the configured account and database ID:

```bash
npx wrangler d1 migrations apply gigas-challenge-list --remote --config platform-worker/wrangler.toml
```

Deploy the API:

```bash
npx wrangler deploy --config platform-worker/wrangler.toml
```

## API routes in this first scaffold

- `GET /api/health`
- `GET /api/levels?status=active&limit=75`

The API is deliberately read-only at this stage. Do not expose record-submission, account, or moderation write routes until authentication and server-side role checks are implemented.

## Next implementation milestone

1. Add an authentication layer compatible with Cloudflare Workers and D1 (including secure sessions and email verification).
2. Link authenticated identities to `player_profiles`.
3. Add server-enforced moderator permissions and audit logging for every moderation action.
4. Implement record submission, review, approval, rejection, and accepted-record creation as transactional operations.
5. Connect the existing frontend to the API and add registration, login, profile, submission, and admin screens.

Never put API secrets, auth secrets, or privileged tokens in browser JavaScript or commit them to this repository. Configure secrets with Wrangler's secret commands.
