(() => {
  "use strict";
  // Reserved footer placement only. No ad provider, tracking, cookies or network requests.
  if (document.querySelector(".gigas-ad-footer")) return;
  const style = document.createElement("style");
  style.textContent = `
    body{min-height:100vh;display:flex;flex-direction:column}
    body>main{flex:1 0 auto}
    .gigas-ad-footer{width:100%;box-sizing:border-box;margin-top:auto;padding:22px 16px 28px;border-top:1px solid #3b3b3b;background:#151515;color:#aaa;text-align:center}
    .gigas-ad-footer-label{display:block;margin-bottom:9px;font:700 10px/1.5 system-ui,sans-serif;letter-spacing:.17em;text-transform:uppercase;color:#aaa}
    .gigas-ad-placeholder{box-sizing:border-box;display:flex;align-items:center;justify-content:center;width:100%;max-width:380px;min-height:80px;margin:0 auto;border:1px dashed #535353;border-radius:9px;background:#222;color:#999;font:500 13px/1.4 system-ui,sans-serif;padding:15px}
    @media(max-width:480px){.gigas-ad-footer{padding:17px 12px 23px}.gigas-ad-placeholder{min-height:68px}}
  `;
  document.head.append(style);
  const footer = document.createElement("footer");
  footer.className = "gigas-ad-footer";
  footer.setAttribute("aria-label", "Advertising area");
  const label = document.createElement("span");
  label.className = "gigas-ad-footer-label";
  label.textContent = "Advertisement";
  const placeholder = document.createElement("div");
  placeholder.className = "gigas-ad-placeholder";
  placeholder.textContent = "Ad space reserved";
  footer.append(label, placeholder);
  document.body.append(footer);
})();