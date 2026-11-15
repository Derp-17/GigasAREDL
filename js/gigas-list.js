(() => {
  "use strict";
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  const grid = document.getElementById("gigas-grid");
  const status = document.getElementById("list-status");
  const search = document.getElementById("search");
  const section = document.getElementById("section");
  const pageLabel = document.getElementById("page-label");
  const prev = document.getElementById("prev");
  const next = document.getElementById("next");
  let levels = [], page = 1;
  const pageSize = 75;
  const allowed = ["active", "extended", "legacy", "all"];
  const requested = new URLSearchParams(location.search).get("section");
  if (allowed.includes(requested)) section.value = requested;
  else { const preferred = window.GigasPreferences?.get().defaultSection; if (allowed.includes(preferred)) section.value = preferred; }
  function filtered() {
    const q = search.value.trim().toLowerCase();
    return levels.filter(l => [l.name, l.creator, l.verifier, l.publisher].some(v => String(v || "").toLowerCase().includes(q)));
  }
  function render() {
    const matches = filtered();
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    grid.replaceChildren();
    const subset = matches.slice((page - 1) * pageSize, page * pageSize);
    for (const level of subset) {
      const card = document.createElement("a");
      card.className = "gigas-card";
      card.href = "challenge.html?id=" + encodeURIComponent(level.id);
      const thumb = document.createElement("div");
      thumb.className = "gigas-thumb";
      if (level.thumbnail_url && /^https:\/\//.test(level.thumbnail_url)) {
        const img = document.createElement("img");
        img.src = level.thumbnail_url; img.alt = ""; img.loading = "lazy";
        thumb.append(img);
      }
      const rank = document.createElement("span");
      rank.className = "gigas-rank"; rank.textContent = level.position ? "#" + level.position : "Unranked";
      thumb.append(rank);
      const body = document.createElement("div"); body.className = "gigas-body";
      const title = document.createElement("h2"); title.textContent = level.name;
      const creator = document.createElement("p"); creator.textContent = "By " + (level.creator || "Unknown");
      const verifier = document.createElement("p"); verifier.textContent = "Verified by " + (level.verifier || "Unknown");
      body.append(title, creator, verifier);
      if (level.points !== null) { const points = document.createElement("p"); points.textContent = level.points + " points"; body.append(points); }
      card.append(thumb, body); grid.append(card);
    }
    status.textContent = matches.length ? matches.length + " challenge" + (matches.length === 1 ? "" : "s") + " found." : "No challenges in this section yet.";
    pageLabel.textContent = "Page " + page + " of " + pages;
    prev.disabled = page === 1; next.disabled = page === pages;
  }
  async function load() {
    status.textContent = "Loading challenges…"; grid.replaceChildren(); page = 1;
    try {
      const sections = section.value === "all" ? ["active", "extended", "legacy"] : [section.value];
      const results = await Promise.all(sections.map(async name => {
        const response = await fetch(api + "/api/levels?status=" + name + "&limit=500", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load challenges.");
        return data.levels;
      }));
      levels = results.flat().sort((a,b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name));
      render();
    } catch (error) { status.textContent = "Could not load challenges: " + error.message; }
  }
  search.addEventListener("input", () => { page = 1; render(); });
  section.addEventListener("change", () => {
    const url = new URL(location.href); url.searchParams.set("section", section.value);
    history.replaceState(null, "", url); void load();
  });
  prev.addEventListener("click", () => { if (page > 1) { page--; render(); } });
  next.addEventListener("click", () => { page++; render(); });
  void load();
})();