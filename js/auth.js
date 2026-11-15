(() => {
  "use strict";
  const status = document.getElementById("auth-status");
  const emailForm = document.getElementById("email-login");
  const emailButton = document.getElementById("email-submit");
  const discordButton = document.getElementById("discord-login");
  const signOutButton = document.getElementById("sign-out");
  const cfg = window.GIGAS_AUTH_CONFIG || {};
  const apiBase = (window.GIGAS_PLATFORM_CONFIG?.apiBase || "").replace(/\/$/, "");
  const profileSection = document.getElementById("profile-section");
  const profileForm = document.getElementById("profile-form");
  const saveProfileButton = document.getElementById("save-profile");
  let lastProfileUser = null;
  async function profileRequest(method, body) {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error("Please sign in again.");
    const response = await fetch(apiBase + "/api/me", {
      method,
      headers: { Authorization: "Bearer " + session.access_token, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Profile request failed.");
    return result;
  }
  async function loadProfile(userId) {
    if (!apiBase) { message("Signed in. Profile API URL needs to be configured."); return; }
    try {
      const { profile } = await profileRequest("GET");
      if (lastProfileUser !== userId) return;
      document.getElementById("username").value = profile?.display_name || "";
      document.getElementById("bio").value = profile?.bio || "";
      const view = document.getElementById("view-profile");
      view.hidden = !profile;
      if (profile) view.href = "player.html?name=" + encodeURIComponent(profile.display_name);
      message(profile ? "Signed in. You can edit your player profile." : "Signed in. Choose your player username.");
    } catch (error) { message("Signed in, but profile could not load: " + error.message); }
  }
  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveProfileButton.disabled = true;
    try {
      const { profile } = await profileRequest("PUT", {
        username: document.getElementById("username").value.trim(),
        bio: document.getElementById("bio").value
      });
      message("Profile saved! Your username is " + profile.display_name + ".");
      const view = document.getElementById("view-profile");
      view.href = "player.html?name=" + encodeURIComponent(profile.display_name);
      view.hidden = false;
    } catch (error) { message(error.message); }
    finally { saveProfileButton.disabled = false; }
  });
  const configured = /^https:\/\/.+\.supabase\.co\/?$/.test(cfg.supabaseUrl || "") && !!cfg.supabaseAnonKey;
  const client = configured && window.supabase
    ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { flowType: "pkce", detectSessionInUrl: true, autoRefreshToken: true, persistSession: true }
      })
    : null;
  const redirectTo = new URL("auth.html", window.location.href).href;
  function message(text) { status.textContent = text; }
  async function refresh() {
    if (!client) {
      message("Login is not configured yet. Please try again later.");
      emailButton.disabled = true;
      discordButton.disabled = true;
      return;
    }
    const { data, error } = await client.auth.getUser();
    if (error && !/session missing/i.test(error.message)) message("Unable to check sign-in status.");
    const user = data?.user;
    signOutButton.hidden = !user;
    emailForm.hidden = !!user;
    discordButton.hidden = !!user;
    profileSection.hidden = !user;
    if (user) {
      if (lastProfileUser !== user.id) {
        lastProfileUser = user.id;
        message("Signed in as " + (user.email || "Discord user") + ".");
        void loadProfile(user.id);
      }
    } else {
      lastProfileUser = null;
    }
  }
  emailForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    emailButton.disabled = true;
    message("Sending sign-in link…");
    const { error } = await client.auth.signInWithOtp({
      email: document.getElementById("email").value.trim(),
      options: { emailRedirectTo: redirectTo, shouldCreateUser: true }
    });
    message(error ? "Could not send sign-in link: " + error.message : "Check your email for a sign-in link.");
    emailButton.disabled = false;
  });
  discordButton.addEventListener("click", async () => {
    if (!client) return;
    discordButton.disabled = true;
    const { error } = await client.auth.signInWithOAuth({
      provider: "discord", options: { redirectTo }
    });
    if (error) { message("Discord sign-in failed: " + error.message); discordButton.disabled = false; }
  });
  signOutButton.addEventListener("click", async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) message("Sign-out failed: " + error.message);
    else { message("Signed out."); await refresh(); }
  });
  if (client) client.auth.onAuthStateChange(() => { void refresh(); });
  void refresh();
})();
