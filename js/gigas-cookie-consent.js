(() => {
  "use strict";
  const KEY = "gigas_cookie_choice_v1";
  const read = () => { try { const v = localStorage.getItem(KEY); return v === "accepted" || v === "rejected" ? v : null; } catch { return null; } };
  const write = value => { try { localStorage.setItem(KEY, value); } catch {} };
  const apply = value => {
    // Preference only: Google AdSense still requires a Google-certified CMP before ads go live.
    if (typeof window.gtag === "function") window.gtag("consent", "update", {
      ad_storage: value === "accepted" ? "granted" : "denied",
      ad_user_data: value === "accepted" ? "granted" : "denied",
      ad_personalization: value === "accepted" ? "granted" : "denied",
      analytics_storage: "denied"
    });
  };
  const style = document.createElement("link");
  style.rel = "stylesheet"; style.href = "css/gigas-cookie-consent.css"; document.head.append(style);
  const banner = document.createElement("section");
  banner.className = "gigas-cookie-banner"; banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-label", "Cookie preferences");
  banner.innerHTML = '<h2>Privacy & cookies</h2><p>We use essential storage for sign-in and website preferences. Google advertising is being prepared but is not yet active. You can choose whether to allow optional advertising storage when it is enabled. <a href="privacy.html">Read our privacy policy</a>.</p><div class="gigas-cookie-actions"><button type="button" data-choice="accepted">Allow optional cookies</button><button type="button" data-choice="rejected">Reject optional cookies</button></div>';
  banner.hidden = !!read();
  banner.querySelectorAll("[data-choice]").forEach(button => button.addEventListener("click", () => {
    const choice = button.dataset.choice;
    write(choice); apply(choice); banner.hidden = true;
  }));
  document.body.append(banner);
  if (read()) apply(read());
  const manage = document.createElement("button");
  manage.type = "button"; manage.textContent = "Cookie preferences";
  manage.addEventListener("click", () => { banner.hidden = false; });
  const footer = document.querySelector(".gigas-ad-footer");
  if (footer) { const holder = document.createElement("div"); holder.className = "gigas-cookie-manage"; holder.append(manage); const policy = document.createElement("a"); policy.href = "privacy.html"; policy.textContent = "Privacy policy"; policy.style.marginLeft = "14px"; holder.append(policy); footer.append(holder); }
})();