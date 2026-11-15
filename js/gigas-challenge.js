(() => {
  "use strict";
  const id = new URLSearchParams(location.search).get("id");
  const status = document.getElementById("challenge-status");
  if (!/^[a-f0-9-]{36}$/.test(id || "")) {
    status.textContent = "Invalid challenge link.";
    return;
  }
  const api = window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/, "");
  const text = (elementId, value) => { document.getElementById(elementId).textContent = value; };
  function renderVideo(level) {
    const video = document.getElementById("challenge-video");
    const fallback = document.getElementById("challenge-video-fallback");
    const linkArea = document.getElementById("challenge-video-link");
    const youtubeId = window.GigasVideo.youtubeId(level.verifier_video_url);
    const thumb = window.GigasVideo.thumbnail(level);
    if (youtubeId) {
      fallback.remove();
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "challenge-video-preview";
      preview.setAttribute("aria-label", "Play verification video");
      if (thumb) {
        const img = document.createElement("img");
        img.src = thumb;
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        preview.append(img);
      }
      const play = document.createElement("span");
      play.className = "challenge-play";
      play.textContent = "▶";
      preview.append(play);
      preview.addEventListener("click", () => {
        const frame = document.createElement("iframe");
        frame.src = "https://www.youtube-nocookie.com/embed/" + youtubeId + "?autoplay=1";
        frame.title = "Verification video for " + level.name;
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.allowFullscreen = true;
        video.replaceChildren(frame);
      });
      video.replaceChildren(preview);
    } else if (thumb) {
      fallback.remove();
      const img = document.createElement("img");
      img.src = thumb;
      img.alt = "Challenge thumbnail";
      img.style.cssText = "width:100%;height:100%;object-fit:cover";
      video.append(img);
    }
    if (level.verifier_video_url) {
      try {
        const url = new URL(level.verifier_video_url);
        if (url.protocol === "https:") {
          const a = document.createElement("a");
          a.href = url.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.textContent = "Watch the verification video in a new tab ↗";
          linkArea.className = "challenge-video-link";
          linkArea.append(a);
        }
      } catch {}
    }
  }
  fetch(api + "/api/challenges/" + encodeURIComponent(id)).then(async response => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load challenge.");
    return data;
  }).then(({ level, victors }) => {
    document.title = level.name + " | Gigas Challenge List";
    text("challenge-name", level.name);
    text("challenge-rank", level.position ? "#" + level.position : "Unranked");
    text("challenge-section", level.list_status === "extended" ? "Extended List" : level.list_status === "legacy" ? "Legacy List" : "Main List");
    text("challenge-byline", "Created by " + (level.creator || "Unknown") + " · Verified by " + (level.verifier || "Unknown"));
    const thumb = window.GigasVideo.thumbnail(level);
    if (thumb) document.getElementById("challenge-banner").style.backgroundImage = 'url("' + thumb.replace(/["\\]/g, "") + '")';
    const fields = {
      rank: level.position ? "#" + level.position : "Unranked",
      creator: level.creator || "Unknown",
      verifier: level.verifier || "Unknown",
      publisher: level.publisher || "Unknown",
      "gd-id": level.gd_level_id || "Not provided",
      points: level.points ?? "Not assigned"
    };
    for (const [key, value] of Object.entries(fields)) text(key, value);
    renderVideo(level);
    document.getElementById("submit-link").href = "submit.html?level=" + encodeURIComponent(level.id);
    const container = document.getElementById("victors");
    text("victor-count", victors.length + (victors.length === 1 ? " completion" : " completions"));
    if (!victors.length) {
      const empty = document.createElement("p");
      empty.className = "challenge-empty";
      empty.textContent = "No verified victors yet. Be the first to complete this challenge!";
      container.append(empty);
    }
    for (const [index, victor] of victors.entries()) {
      const row = document.createElement("div");
      row.className = "challenge-victor";
      const number = document.createElement("span");
      number.className = "challenge-victor-number";
      number.textContent = "#" + (index + 1);
      const link = document.createElement("a");
      link.href = "player.html?name=" + encodeURIComponent(victor.player_name);
      link.textContent = victor.player_name;
      row.append(number, link);
      container.append(row);
    }
    document.getElementById("challenge-content").hidden = false;
    status.textContent = "";
  }).catch(error => { status.textContent = error.message; });
})();