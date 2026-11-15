(() => {
  "use strict";
  function youtubeId(value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
      let id = null;
      if (host === "youtu.be") id = url.pathname.split("/")[1];
      else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "watch") id = url.searchParams.get("v");
        else if (["shorts", "embed", "live", "v"].includes(parts[0])) id = parts[1];
      }
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    } catch { return null; }
  }
  function thumbnail(level) {
    const id = youtubeId(level.verifier_video_url);
    if (id) return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
    try {
      const url = new URL(level.thumbnail_url || "");
      if (url.protocol === "https:") return url.href;
    } catch {}
    return null;
  }
  window.GigasVideo = { youtubeId, thumbnail };
})();