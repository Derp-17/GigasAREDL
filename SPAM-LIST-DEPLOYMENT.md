# Spam Challenge List deployment

The Spam Challenge List has its own D1 tables and API endpoints. Pages deploying from GitHub do **not** automatically migrate the D1 database or deploy the separate API Worker.

From the repository root:

```bash
cd platform-worker
npx wrangler d1 migrations apply gigas-challenge-list --remote
npx wrangler deploy
```

Use the Cloudflare account already connected to the Worker. Run migrations **before** deploying the updated Worker, because account deletion and export now include spam submissions.

Pages:
- `/spam-list`: difficulty ranking with CPS/duration
- `/spam-leaderboard`: separate points and victories
- `/spam-submit`: authenticated video submissions
- `/spam-admin`: owner/admin challenge editor; staff moderation

All spam data is stored separately from main challenge levels, submissions, records, and points. CPS is displayed as a statistic; rank is set by staff according to overall difficulty. Approved spam records award `1000 / position` points on the spam leaderboard only.

There are initially no spam challenges. An owner or admin adds them via the Spam List staff page after the migration and Worker deployment.

This code has not been browser-tested against the deployed Worker. Verify challenge creation, submission, approval, leaderboard, profile permissions, and account deletion/export after deployment.
