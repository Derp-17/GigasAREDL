(() => {
  "use strict";
  const cfg = window.GIGAS_AUTH_CONFIG;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  const status = document.getElementById("review-status");
  const list = document.getElementById("submission-list");
  const filter = document.getElementById("filter");
  let submissions = [];
  async function request(path, options = {}) {
    const { data: { session } } = await client.auth.getSession();
    if (!session) throw new Error("Please sign in first.");
    const response = await fetch(api + path, {
      ...options, headers: { Authorization: "Bearer " + session.access_token, ...(options.headers || {}) }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }
  function el(tag, value) {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  }
  function render() {
    list.replaceChildren();
    const visible = submissions.filter(s => filter.value === "all" || s.status === filter.value);
    if (!visible.length) { list.textContent = "No submissions match this filter."; return; }
    for (const s of visible) {
      const box = el("article", ""); box.className = "entry";
      box.append(el("h2", s.level_name + " — " + s.percent + "%"));
      const player = el("p", "Player: " + s.player_name + " · Status: " + s.status.replace("_", " "));
      box.append(player, el("small", "Submitted: " + new Date(s.submitted_at).toLocaleString()));
      const video = el("a", "View video evidence");
      video.href = s.evidence_url; video.target = "_blank"; video.rel = "noopener noreferrer";
      box.append(video);
      if (s.notes) box.append(el("p", "Player notes: " + s.notes));
      if (s.review_note) box.append(el("p", "Review note: " + s.review_note));
      if (s.status === "pending") {
        const label = el("label", "Review note (optional)"); label.htmlFor = "note-" + s.id;
        const note = document.createElement("textarea"); note.id = label.htmlFor; note.maxLength = 500; note.rows = 2;
        box.append(label, note);
        for (const [value, caption] of [["approved", "Approve"], ["rejected", "Reject"], ["needs_changes", "Request changes"]]) {
          const button = el("button", caption); button.type = "button";
          button.addEventListener("click", async () => {
            if (!confirm(caption + " submission from " + s.player_name + " for " + s.level_name + "?")) return;
            box.querySelectorAll("button").forEach(b => b.disabled = true);
            try {
              await request("/api/admin/submissions/" + encodeURIComponent(s.id), {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: value, review_note: note.value })
              });
              status.textContent = "Submission " + value.replace("_", " ") + ".";
              await refresh();
            } catch (error) {
              status.textContent = error.message;
              box.querySelectorAll("button").forEach(b => b.disabled = false);
            }
          });
          box.append(button);
        }
      }
      list.append(box);
    }
  }
  async function refresh() {
    const data = await request("/api/admin/submissions");
    submissions = data.submissions;
    render();
  }
  filter.addEventListener("change", render);
  void refresh().then(() => { status.textContent = "Showing the latest submissions. Approvals create verified records."; })
    .catch(error => { status.textContent = error.message; });
})();