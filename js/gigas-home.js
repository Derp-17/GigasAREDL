(() => {
  "use strict";
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  Promise.all(["active", "extended", "legacy"].map(async section => {
    const response = await fetch(api + "/api/levels?status=" + section + "&limit=500", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load challenges.");
    return data.levels;
  })).then(([main, extended, legacy]) => {
    const all = [...main, ...extended, ...legacy];
    document.getElementById("total-challenges").textContent = all.length;
    const first = main.filter(l => l.position != null).sort((a,b) => a.position - b.position)[0];
    const top = document.getElementById("top-challenge");
    top.textContent = first ? first.name : "Not ranked yet";
    if (first) top.closest("a").href = "challenge.html?id=" + encodeURIComponent(first.id);
    document.getElementById("home-status").textContent = all.length ? "Explore the current challenge rankings." : "No challenges have been added yet.";
  }).catch(error => { document.getElementById("home-status").textContent = "Could not load list statistics: " + error.message; });
})();