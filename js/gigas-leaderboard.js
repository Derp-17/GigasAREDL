(() => {
"use strict";const status=document.getElementById("leaderboard-status"),list=document.getElementById("leaderboard-list");
fetch(window.GIGAS_PLATFORM_CONFIG.apiBase+"/api/leaderboard").then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Could not load leaderboard");return d.players;}).then(players=>{
status.textContent=players.length?players.length+" ranked players":"No verified 100% completions yet.";list.replaceChildren();
for(const [i,p] of players.entries()){const row=document.createElement("li"),rank=document.createElement("span"),link=document.createElement("a"),stats=document.createElement("span");rank.className="feature-rank";rank.textContent="#"+(i+1);link.href="player.html?name="+encodeURIComponent(p.username);link.textContent=p.username;stats.textContent=" — "+Number(p.points).toLocaleString()+" points · "+p.victories+" victories";row.append(rank,link,stats);list.append(row);}
}).catch(e=>status.textContent=e.message);
})();