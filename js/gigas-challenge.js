(() => {
  "use strict";
  const id = new URLSearchParams(location.search).get("id");
  const status = document.getElementById("challenge-status");
  if (!/^[a-f0-9-]{36}$/.test(id || "")) { status.textContent = "Invalid challenge link."; return; }
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  fetch(api + "/api/challenges/" + encodeURIComponent(id)).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load challenge.");
    return data;
  }).then(({ level, victors }) => {
    document.title = level.name + " | Gigas Challenge List";
    document.getElementById("challenge-name").textContent = level.name;
    const fields = { rank: level.position ? "#" + level.position : "Unranked", creator: level.creator || "Unknown", verifier: level.verifier || "Unknown", publisher: level.publisher || "Unknown", "gd-id": level.gd_level_id || "Not provided", points: level.points ?? "Not assigned" };
    for (const [key, value] of Object.entries(fields)) document.getElementById(key).textContent = value;
    if (level.verifier_video_url) {
      const link = document.createElement("a");
      link.href = level.verifier_video_url; link.target = "_blank"; link.rel = "noopener noreferrer";
      link.textContent = "Watch verification video";
      document.getElementById("video").append(link);
    }
    document.getElementById("submit-link").href = "submit.html?level=" + encodeURIComponent(level.id);
    const container = document.getElementById("victors");
    if (!victors.length) container.textContent = "No verified victors yet.";
    for (const victor of victors) {
      const row = document.createElement("p"); row.className = "victor";
      const link = document.createElement("a");
      link.href = "player.html?name=" + encodeURIComponent(victor.player_name);
      link.textContent = victor.player_name;
      row.append(link); container.append(row);
    }
    document.getElementById("challenge-content").hidden = false;
    document.getElementById("victor-panel").hidden = false;
    status.textContent = "";
  }).catch(error => { status.textContent = error.message; });
})();