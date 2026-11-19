(() => {
  "use strict";
  const page = location.pathname.split("/").pop() || "index.html";
  const active = (name) => page === name ? ' aria-current="page"' : "";
  const header = document.createElement("header");
  header.className = "gigas-header";
  header.innerHTML = '<a class="gigas-brand" href="index.html"><img src="assets/logo.png" width="32" height="32" alt=""><span>GIGA\'S CHALLENGE LIST<small>Geometry Dash challenges</small></span></a>' +
    '<nav class="gigas-nav" aria-label="Main navigation"><a href="index.html"' + active("index.html") + '>Home</a><a href="list.html"' + (page === "challenge.html" ? ' aria-current="page"' : active("list.html")) + '>Challenges</a><a href="leaderboard.html"' + active("leaderboard.html") + '>Leaderboard</a><details class="gigas-more"><summary>More<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><div class="gigas-more-menu"><a href="roulette.html">Roulette</a><a href="time-machine.html">Time Machine</a><a href="submit.html">Submit a record</a><a href="settings.html">Settings</a><a href="guidelines.html">Guidelines</a><a href="staff.html">Staff team</a><a href="support.html">Support Centre</a><a href="privacy.html">Privacy Policy</a></div></details></nav>' +
    '<div class="gigas-header-actions"><a class="gigas-profile" href="auth.html" aria-label="Your profile"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-3.5 3.5-5 8-5s8 1.5 8 5v2"/></svg><span>Profile</span></a><a class="gigas-admin-link" href="admin.html" hidden>Admin</a></div>';
  function mount() {
    document.querySelectorAll("header.site-header, nav.feature-nav, nav.home-topnav").forEach(el => el.remove());
    document.body.prepend(header);
    document.addEventListener("click", event => {
      const more = header.querySelector(".gigas-more");
      if (more.open && !more.contains(event.target)) more.open = false;
    });
    const adminLink = header.querySelector(".gigas-admin-link");
    (async () => {
      const auth = window.GIGAS_AUTH_CONFIG, platform = window.GIGAS_PLATFORM_CONFIG;
      if (!window.supabase?.createClient || !auth?.supabaseUrl || !auth?.supabaseAnonKey || !platform?.apiBase) return;
      const client = window.supabase.createClient(auth.supabaseUrl, auth.supabaseAnonKey);
      const { data: { session } } = await client.auth.getSession();
      if (!session?.access_token) return;
      const response = await fetch(platform.apiBase.replace(/\/$/, "") + "/api/admin/me", { headers: { Authorization: "Bearer " + session.access_token }, cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      if (data.ok && ["owner","admin","moderator"].includes(data.role)) adminLink.hidden = false;
    })().catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();