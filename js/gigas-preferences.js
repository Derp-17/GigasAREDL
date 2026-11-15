(() => {
"use strict";
const KEY="gigas_preferences_v1";
const defaults={accent:"orange",motion:false,compact:false,defaultSection:"active",hideVerified:false};
const palette={orange:"#ff6e00",red:"#ef4444",blue:"#3b82f6",green:"#22c55e",pink:"#ec4899",yellow:"#eab308"};
function get(){try{return {...defaults,...JSON.parse(localStorage.getItem(KEY)||"{}")};}catch{return {...defaults};}}
function set(next){const prefs={...get(),...next};try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{}apply(prefs);return prefs;}
function apply(prefs=get()){document.documentElement.style.setProperty("--primary",palette[prefs.accent]||palette.orange);document.documentElement.style.setProperty("--primary-dark",palette[prefs.accent]||palette.orange);document.body.classList.toggle("feature-compact",!!prefs.compact);document.documentElement.classList.toggle("gigas-reduce-motion",!!prefs.motion);}
const style=document.createElement("style");style.textContent=".gigas-reduce-motion *, .gigas-reduce-motion *::before, .gigas-reduce-motion *::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}";document.head.append(style);
window.GigasPreferences={get,set,apply};if(document.body)apply();else document.addEventListener("DOMContentLoaded",()=>apply());
})();