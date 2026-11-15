(() => {
  "use strict";
  const cfg = window.GIGAS_AUTH_CONFIG;
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const status = document.getElementById("admin-status");
  const form = document.getElementById("level-form");
  const save = document.getElementById("save-level");
  async function apiRequest(path, options = {}) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error("Sign in at auth.html first.");
    const response = await fetch(api + path, { ...options, headers: {
      Authorization: "Bearer " + session.access_token, ...(options.headers || {})
    }});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }
  async function init() {
    try {
      const { role } = await apiRequest("/api/admin/me");
      status.textContent = "Signed in with " + role + " permissions.";
      document.getElementById("admin-card").hidden = false;
    } catch (error) { status.textContent = error.message; }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    const value = id => document.getElementById(id).value.trim();
    try {
      const position = value("position"), points = value("points");
      const result = await apiRequest("/api/admin/levels", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value("name"), creator: value("creator"), verifier: value("verifier"),
          publisher: value("publisher"), gd_level_id: value("gd_level_id"),
          verifier_video_url: value("verifier_video_url"),
          position: position ? Number(position) : null,
          points: points ? Number(points) : null, list_status: value("list_status")
        })
      });
      status.textContent = "Challenge added successfully (ID: " + result.id + ").";
      form.reset();
    } catch (error) { status.textContent = error.message; }
    finally { save.disabled = false; }
  });
  void init();
})();