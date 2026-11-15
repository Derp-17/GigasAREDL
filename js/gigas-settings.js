(() => {
"use strict";const p=window.GigasPreferences;const fields={accent:"accent",motion:"motion",compact:"compact",defaultSection:"default-section",hideVerified:"hide-verified"};
function fill(){const values=p.get();for(const [key,id] of Object.entries(fields)){const input=document.getElementById(id);if(input.type==="checkbox")input.checked=!!values[key];else input.value=values[key];}}
for(const [key,id] of Object.entries(fields)){const input=document.getElementById(id);input.addEventListener("change",()=>{p.set({[key]:input.type==="checkbox"?input.checked:input.value});document.getElementById("save-status").textContent="Settings saved.";});}
document.getElementById("reset").addEventListener("click",()=>{p.set({accent:"orange",motion:false,compact:false,defaultSection:"active",hideVerified:false});fill();document.getElementById("save-status").textContent="Settings reset.";});fill();
})();