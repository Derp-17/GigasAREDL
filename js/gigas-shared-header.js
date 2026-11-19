(() => {
  "use strict";
  const route = decodeURIComponent(location.pathname).replace(/\/+$/, "").split("/").pop() || "index";
  const page = route.endsWith(".html") ? route : route + ".html";
  const active = (name) => page === name ? ' aria-current="page"' : "";
  const morePages = new Set(["roulette.html","time-machine.html","submit.html","settings.html","guidelines.html","staff.html","support.html","privacy.html"]);
  const staffPages = new Set(["admin.html","admin-levels.html","admin-users.html","admin-submissions.html","admin-support.html"]);
  const isMorePage = morePages.has(page);
  const header = document.createElement("header");
  header.className = "gigas-header";
  header.innerHTML = '<a class="gigas-brand" href="index.html"><img src="assets/logo.png" width="32" height="32" alt=""><span>GIGA\'S CHALLENGE LIST<small>Geometry Dash challenges</small></span></a>' +
    '<nav class="gigas-nav" aria-label="Main navigation"><a href="index.html"' + active("index.html") + '>Home</a><a href="list.html"' + (page === "challenge.html" ? ' aria-current="page"' : active("list.html")) + '>Challenges</a><a href="leaderboard.html"' + active("leaderboard.html") + '>Leaderboard</a><details class="gigas-more"' + (isMorePage ? ' data-current="true"' : '') + '><summary' + (isMorePage ? ' aria-current="page"' : '') + '>More<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="m5 7 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></summary><div class="gigas-more-menu"><a href="roulette.html"' + active("roulette.html") + '>Roulette</a><a href="time-machine.html"' + active("time-machine.html") + '>Time Machine</a><a href="submit.html"' + active("submit.html") + '>Submit a record</a><a href="settings.html"' + active("settings.html") + '>Settings</a><a href="guidelines.html"' + active("guidelines.html") + '>Guidelines</a><a href="staff.html"' + active("staff.html") + '>Staff team</a><a href="support.html"' + active("support.html") + '>Support Centre</a><a href="privacy.html"' + active("privacy.html") + '>Privacy Policy</a></div></details></nav>' +
    '<div class="gigas-header-actions"><a class="gigas-profile" href="auth.html"' + active("auth.html") + ' aria-label="Your profile"><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-3.5 3.5-5 8-5s8 1.5 8 5v2"/></svg><span>Profile</span></a><a class="gigas-admin-link" href="admin.html"' + (staffPages.has(page) ? ' aria-current="page"' : '') + ' hidden>Admin</a></div>';
  function mount() {\n    // All pages must apply the same saved accent, not just pages that\n    // explicitly imported the preferences script.\n    if (!window.GigasPreferences) {\n      const prefsScript = document.createElement("script");\n      prefsScript.src = "js/gigas-preferences.js";\n      document.head.append(prefsScript);\n    } else window.GigasPreferences.apply();
    document.querySelectorAll("header.site-header, nav.feature-nav, nav.home-topnav").forEach(el => el.remove());
    document.body.prepend(header);
    document.addEventListener("click", event => {
      const more = header.querySelector(".gigas-more");
      if (more.open && !more.contains(event.target)) more.open = false;
    });
    const adminLink = header.querySelector(".gigas-admin-link");
    const loadScript = src => new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    (async () => {
      // Some legacy pages do not load the auth libraries. Make the shared
      // header independent of which page it appears on.
      if (!window.GIGAS_PLATFORM_CONFIG) await loadScript("js/platform-config.js");
      if (!window.GIGAS_AUTH_CONFIG) await loadScript("js/auth-config.js");
      if (!window.supabase?.createClient) await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
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