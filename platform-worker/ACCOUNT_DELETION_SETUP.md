# Enable permanent account deletion

1. In Cloudflare D1 > gigas-challenge-list > Console, execute `platform-worker/migrations/0003_account_deletion.sql`. Do not re-run 0001.
2. In Cloudflare > Workers & Pages > `gigas-challenge-list-api` > Settings > Variables and Secrets, create an **encrypted secret** named `SUPABASE_SERVICE_ROLE_KEY`. Its value must be a server-side Supabase service-role key from your Supabase project's API settings. **Never** add it to GitHub, `wrangler.toml`, public HTML, or browser JavaScript. A Supabase publishable/anon key is insufficient.
3. Deploy/redeploy the Worker, and check the GitHub Actions deployment succeeded.
4. Test only with a disposable **non-staff** account. Export its data before deleting. Type `DELETE MY ACCOUNT` in Settings and confirm. Check the login no longer works, its profile and leaderboard records disappear, and its support tickets are removed. **Do not test with your owner account.**

The deletion API rejects staff accounts, requires a valid authenticated session and exact typed confirmation, and checks that the server secret exists. It deletes the Supabase auth identity and then D1 records. If D1 cleanup fails, a D1 recovery job remains and the existing scheduled Worker retries it. Network failures during the auth deletion can leave a `pending` job that requires manual reconciliation; do not blindly retry without checking Supabase.

Important limitations: Supabase/Cloudflare backups and external provider logs may retain data under their retention policies. Existing historical snapshots of public level data are not rewritten. Moderation logs authored by the deleted user are anonymised, but other historical log entries may still contain user-supplied text. Verify the complete privacy retention policy and legal requirements before claiming comprehensive erasure. The old manual deletion-request option remains available for exceptions.
