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
  let editing = null;
  let levels = [];
  const value = id => document.getElementById(id).value.trim();
  function resetEdit() {
    editing = null; form.reset(); updatePointsPreview();
    document.getElementById("form-title").textContent = "Add a challenge";
    save.textContent = "Add challenge";
    document.getElementById("cancel-edit").hidden = true;
  }
  function updatePointsPreview() {
    const position = Number(value("position"));
    const custom = value("points");
    const preview = document.getElementById("points-preview");
    if (custom !== "") preview.textContent = "Custom points: " + Number(custom).toLocaleString();
    else if (Number.isInteger(position) && position > 0)
      preview.textContent = "Automatic points: " + (Math.round(100000 / position) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " (1,000 ÷ #" + position + ")";
    else preview.textContent = "Enter a position to calculate points automatically.";
  }
  document.getElementById("position").addEventListener("input", updatePointsPreview);
  document.getElementById("points").addEventListener("input", updatePointsPreview);
  document.getElementById("cancel-edit").addEventListener("click", resetEdit);
  async function refreshLevels() {
    const data = await apiRequest("/api/admin/levels/all");
    levels = data.levels;
    const list = document.getElementById("admin-level-list");
    list.replaceChildren();
    document.getElementById("levels-message").textContent = levels.length ? levels.length + " challenges" : "No challenges yet.";
    for (const level of levels) {
      const row = document.createElement("div"); row.className = "level-row";
      const title = document.createElement("strong");
      title.textContent = level.name + " · " + level.list_status + (level.position ? " · #" + level.position : "");
      const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        editing = level.id;
        for (const id of ["name", "creator", "verifier", "publisher", "gd_level_id", "verifier_video_url", "position", "points", "list_status"])
          document.getElementById(id).value = level[id] ?? "";
        updatePointsPreview();
        document.getElementById("form-title").textContent = "Edit " + level.name;
        save.textContent = "Save changes";
        document.getElementById("cancel-edit").hidden = false;
        form.scrollIntoView({ behavior: "smooth" });
      });
      const del = document.createElement("button"); del.type = "button"; del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm("Permanently delete " + level.name + "? Challenges with submissions cannot be deleted.")) return;
        del.disabled = true;
        try {
          await apiRequest("/api/admin/levels/" + encodeURIComponent(level.id), { method: "DELETE" });
          if (editing === level.id) resetEdit();
          status.textContent = "Challenge deleted.";
          await refreshLevels();
        } catch (error) { status.textContent = error.message; del.disabled = false; }
      });
      row.append(title, edit, del); list.append(row);
    }
  }
  async function init() {
    try {
      const { role } = await apiRequest("/api/admin/me");
      if (!["owner", "admin"].includes(role)) throw new Error("Owner or admin access required.");
      status.textContent = "Signed in with " + role + " permissions.";
      document.getElementById("admin-card").hidden = false;
      await refreshLevels();
    } catch (error) { status.textContent = error.message; }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    save.disabled = true;
    try {
      const position = value("position"), points = value("points");
      const result = await apiRequest(editing ? "/api/admin/levels/" + encodeURIComponent(editing) : "/api/admin/levels", {
        method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: value("name"), creator: value("creator"), verifier: value("verifier"),
          publisher: value("publisher"), gd_level_id: value("gd_level_id"),
          verifier_video_url: value("verifier_video_url"),
          position: position ? Number(position) : null,
          points: points ? Number(points) : null, list_status: value("list_status")
        })
      });
      status.textContent = editing ? "Challenge updated successfully." : "Challenge added successfully (ID: " + result.id + ").";
      resetEdit();
      await refreshLevels();
    } catch (error) { status.textContent = error.message; }
    finally { save.disabled = false; }
  });
  void init();
})();