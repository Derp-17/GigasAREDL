(() => {
  "use strict";
  const links = [...document.querySelectorAll('a[href="admin.html"], a[href="./admin.html"]')];
  if (!links.length) return;
  // Hidden by default; never trust frontend visibility for authorization.
  for (const link of links) link.hidden = true;
  async function showForAuthorizedUser() {
    const auth = window.GIGAS_AUTH_CONFIG;
    const platform = window.GIGAS_PLATFORM_CONFIG;
    if (!window.supabase?.createClient || !auth?.supabaseUrl || !auth?.supabaseAnonKey || !platform?.apiBase) return;
    const client = window.supabase.createClient(auth.supabaseUrl, auth.supabaseAnonKey);
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) return;
    const response = await fetch(platform.apiBase.replace(/\/$/, "") + "/api/admin/me", {
      headers: { Authorization: "Bearer " + session.access_token },
      cache: "no-store"
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.ok || !["owner", "admin"].includes(data.role)) return;
    for (const link of links) link.hidden = false;
  }
  void showForAuthorizedUser().catch(() => {});
})();