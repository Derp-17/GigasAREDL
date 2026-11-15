(() => {
  "use strict";
  const cfg = window.GIGAS_AUTH_CONFIG;
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const status = document.getElementById("account-status");
  const form = document.getElementById("submission-form");
  const history = document.getElementById("history");
  const button = document.getElementById("submit-record");
  async function request(path, options = {}) {
    const { data: { session } } = await client.auth.getSession();
    if (!session?.access_token) throw new Error("Please sign in.");
    const response = await fetch(api + path, {
      ...options,
      headers: { Authorization: "Bearer " + session.access_token, ...(options.headers || {}) }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Request failed.");
    return result;
  }
  async function loadHistory() {
    const { submissions } = await request("/api/submissions");
    history.replaceChildren();
    if (!submissions.length) { history.textContent = "No submissions yet."; return; }
    for (const item of submissions) {
      const div = document.createElement("div");
      div.className = "submission";
      const title = document.createElement("strong");
      title.textContent = item.level_name + " — " + item.percent + "%";
      const detail = document.createElement("small");
      detail.textContent = item.status.replace("_", " ") + " · " + new Date(item.submitted_at).toLocaleString();
      const evidence = document.createElement("a");
      evidence.href = item.evidence_url;
      evidence.target = "_blank"; evidence.rel = "noopener noreferrer";
      evidence.textContent = "View evidence";
      div.append(title, detail, document.createElement("br"), evidence);
      if (item.review_note) {
        const note = document.createElement("p");
        note.textContent = "Moderator note: " + item.review_note;
        div.append(note);
      }
      history.append(div);
    }
  }
  async function init() {
    try {
      const { data: { session } } = await client.auth.getSession();
      if (!session) {
        status.replaceChildren("Please ", Object.assign(document.createElement("a"), {href:"auth.html",textContent:"sign in"}), " before submitting.");
        return;
      }
      const { profile } = await request("/api/me");
      if (!profile) {
        status.replaceChildren("Please ", Object.assign(document.createElement("a"), {href:"auth.html",textContent:"create a player profile"}), " first.");
        return;
      }
      status.textContent = "Submitting as " + profile.display_name;
      const levelSelect = document.getElementById("level");
      for (const listStatus of ["active", "extended", "legacy"]) {
        const response = await fetch(api + "/api/levels?status=" + listStatus + "&limit=150");
        if (!response.ok) throw new Error("Could not load challenges.");
        const { levels } = await response.json();
        for (const level of levels) {
          const option = document.createElement("option");
          option.value = level.id;
          option.textContent = level.name + (level.position ? " (#" + level.position + ")" : "");
          levelSelect.append(option);
        }
      }
      const requestedLevel = new URLSearchParams(location.search).get("level");
      if (requestedLevel && [...levelSelect.options].some(option => option.value === requestedLevel)) levelSelect.value = requestedLevel;
      form.hidden = false;
      if (levelSelect.options.length === 1) status.textContent += " — No challenges have been added yet.";
      await loadHistory();
    } catch (error) { status.textContent = error.message; }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    button.disabled = true;
    try {
      await request("/api/submissions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level_id: document.getElementById("level").value,
          percent: Number(document.getElementById("percent").value),
          evidence_url: document.getElementById("evidence").value.trim(),
          notes: document.getElementById("notes").value
        })
      });
      status.textContent = "Submission received! It is pending moderator review.";
      form.reset();
      await loadHistory();
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });
  void init();
})();