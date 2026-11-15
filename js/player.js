(() => {
  "use strict";
  const name = new URLSearchParams(location.search).get("name") || "";
  const message = document.getElementById("profile-message");
  const apiBase = window.GIGAS_PLATFORM_CONFIG?.apiBase || "";
  if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) {
    message.textContent = "Invalid or missing player username.";
    return;
  }
  if (!apiBase) { message.textContent = "Profile service is not configured."; return; }
  fetch(apiBase.replace(/\/$/, "") + "/api/players/" + encodeURIComponent(name))
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load profile.");
      return data.profile;
    })
    .then(profile => {
      document.title = profile.display_name + " | Gigas Challenge List";
      document.getElementById("player-name").textContent = profile.display_name;
      document.getElementById("avatar").textContent = profile.display_name.slice(0,1).toUpperCase();
      document.getElementById("joined").textContent = profile.created_at
        ? "Joined " + new Date(profile.created_at).toLocaleDateString(undefined, {year:"numeric",month:"long"})
        : "";
      if (profile.bio) {
        document.getElementById("player-bio").textContent = profile.bio;
        document.getElementById("player-bio").hidden = false;
      }
      // Records and points are placeholders until approved-record APIs are implemented.
      document.getElementById("stats").hidden = false;
      document.getElementById("records-title").hidden = false;
      document.getElementById("records-empty").hidden = false;
      message.hidden = true;
    })
    .catch(error => { message.textContent = error.message; });
})();
