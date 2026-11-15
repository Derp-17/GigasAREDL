(() => {
  "use strict";
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase;
  const status = document.getElementById("history-status");
  const list = document.getElementById("history-list");
  const date = document.getElementById("history-date");
  const ukDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  date.max = ukDate;
  date.value = ukDate;
  async function load() {
    list.replaceChildren();
    status.textContent = "Loading historical rankings…";
    try {
      const response = await fetch(api + "/api/history?date=" + encodeURIComponent(date.value));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "History unavailable");
      if (!data.tracking_started) {
        status.textContent = "No nightly snapshot is available for this date yet. Snapshots are saved automatically at 23:00 UK time.";
        return;
      }
      status.textContent = "Showing rankings captured on " + data.snapshot_date + " at approximately 23:00 UK time." +
        (data.exact_date ? "" : " No snapshot exists for the selected date, so the latest earlier snapshot is shown.");
      if (!data.levels.length) status.textContent += " No listed challenges were recorded.";
      for (const level of data.levels) {
        const row = document.createElement("li");
        const rank = document.createElement("span");
        const link = document.createElement("a");
        rank.className = "feature-rank";
        rank.textContent = level.position ? "#" + level.position : "—";
        link.href = "challenge.html?id=" + encodeURIComponent(level.id);
        link.textContent = level.name;
        row.append(rank, link, document.createTextNode(" · " + level.list_status));
        list.append(row);
      }
    } catch (error) { status.textContent = error.message; }
  }
  document.getElementById("history-load").addEventListener("click", load);
  void load();
})();