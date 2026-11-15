(() => {
  "use strict";
  const status = document.getElementById("auth-status");
  const emailForm = document.getElementById("email-login");
  const emailButton = document.getElementById("email-submit");
  const discordButton = document.getElementById("discord-login");
  const signOutButton = document.getElementById("sign-out");
  const cfg = window.GIGAS_AUTH_CONFIG || {};
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
    if (user) message("Signed in as " + (user.email || "Discord user") + ". Player profiles are coming next.");
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
