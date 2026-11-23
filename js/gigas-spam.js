(() => {
"use strict";
const api=window.GIGAS_PLATFORM_CONFIG.apiBase.replace(/\/$/,"");
const $=id=>document.getElementById(id);
const status=$("spam-status");
const cfg=window.GIGAS_AUTH_CONFIG;
const client=cfg&&window.supabase?.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
async function req(path,options={},auth=false){
 const headers={...(options.body?{"Content-Type":"application/json"}:{})};
 if(auth){if(!client)throw Error("Authentication unavailable.");const {data:{session}}=await client.auth.getSession();if(!session)throw Error("Sign in through Profile first.");headers.Authorization="Bearer "+session.access_token;}
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);let response;try{response=await fetch(api+path,{...options,headers,cache:"no-store",signal:controller.signal});}catch(e){throw Error(e.name==="AbortError"?"API request timed out. Check your Cloudflare Worker deployment.":"Cannot reach the API. Check your connection and Worker deployment.");}finally{clearTimeout(timeout)}
 let data;try{data=await response.json()}catch{throw Error("API returned an invalid response (HTTP "+response.status+"). Check the Worker deployment.")}if(!response.ok)throw Error(data.error||"API request failed (HTTP "+response.status+").");return data;
}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;}
function link(text,url){const a=el("a",text);a.href=url;return a;}
function msg(text){if(status)status.textContent=text;}
const mode=document.body.dataset.spamMode;
async function list(){
 const {challenges}=await req("/api/spam/challenges");
 const grid=$("spam-grid"),search=$("spam-search");let items=challenges;
 function render(){grid.replaceChildren();const q=search.value.toLowerCase();const found=items.filter(c=>[c.name,c.creator,c.verifier,c.gd_level_id].some(v=>String(v||"").toLowerCase().includes(q)));
 for(const c of found){const card=el("article",undefined,"spam-card");const rank=el("span","#"+c.position,"spam-rank");const info=el("div",undefined,"spam-card-info");info.append(el("h2",c.name),el("p","By "+(c.creator||"Unknown")+" · Verified by "+(c.verifier||"Unknown")));const stats=el("div",undefined,"spam-stats");stats.append(el("strong",Number(c.cps).toLocaleString()+" CPS"),el("span",c.duration_seconds?c.duration_seconds+"s duration":"Duration not listed"));info.append(stats);if(c.notes)info.append(el("p",c.notes));if(c.video_url)info.append(link("Verification video",c.video_url));if(c.gd_level_id)info.append(el("small","GD ID: "+c.gd_level_id));const action=link("Submit record","spam-submit.html?challenge="+encodeURIComponent(c.id));action.className="spam-action";card.append(rank,info,action);grid.append(card);}
 msg(found.length+" spam challenge"+(found.length===1?"":"s")+" found.");}
 search.addEventListener("input",render);render();
}
async function leaderboard(){
 const {players}=await req("/api/spam/leaderboard");const list=$("spam-players");list.replaceChildren();for(const [i,p] of players.entries()){const row=el("li",undefined,"spam-player");row.append(el("strong","#"+(i+1)),link(p.username,"player.html?name="+encodeURIComponent(p.username)),el("span",p.points+" points · "+p.victories+" victories"));list.append(row);}msg(players.length?players.length+" ranked players":"No approved spam completions yet.");
}
async function submit(){
 if(!client){msg("Authentication unavailable.");return;}
 const form=$("spam-submit-form");const {challenges}=await req("/api/spam/challenges");for(const c of challenges){const opt=el("option","#"+c.position+" · "+c.name+" ("+c.cps+" CPS)");opt.value=c.id;$("spam-challenge").append(opt);}
 const selected=new URLSearchParams(location.search).get("challenge");if(selected)$("spam-challenge").value=selected;
 const {data:{session}}=await client.auth.getSession();if(!session){msg("Sign in to submit a spam record.");return;}form.hidden=false;msg("Submit a verified completion. Records are reviewed by staff.");
 form.addEventListener("submit",async event=>{event.preventDefault();const button=form.querySelector("button");button.disabled=true;try{await req("/api/spam/submissions",{method:"POST",body:JSON.stringify({challenge_id:$("spam-challenge").value,evidence_url:$("spam-evidence").value.trim(),notes:$("spam-notes").value.trim()})},true);form.reset();msg("Submission received! Staff will review it.");await submissions();}catch(e){msg(e.message)}finally{button.disabled=false}});
 await submissions();
}
async function submissions(){const list=$("spam-my-records");if(!list)return;const {submissions}=await req("/api/spam/submissions",{},true);list.replaceChildren();for(const s of submissions){const p=el("p",s.challenge_name+" — "+s.status+(s.review_note?" · "+s.review_note:""));list.append(p);}}
function readForm(){return {name:$("spam-name").value.trim(),creator:$("spam-creator").value.trim(),verifier:$("spam-verifier").value.trim(),gd_level_id:$("spam-gdid").value.trim(),video_url:$("spam-video").value.trim(),position:Number($("spam-position").value),cps:Number($("spam-cps").value),duration_seconds:$("spam-duration").value?Number($("spam-duration").value):null,notes:$("spam-description").value.trim()};}
async function admin(){
 msg("Verifying staff permissions…");const me=await req("/api/admin/me",{},true);const editor=$("spam-editor");editor.hidden=!["owner","admin"].includes(me.role);$("spam-review").hidden=false;
 const form=$("spam-admin-form");let editing=null;
 async function load(){
 const {challenges}=await req("/api/spam/challenges");const area=$("spam-manage-list");area.replaceChildren();
 for(const c of challenges){if(!["owner","admin"].includes(me.role))break;const row=el("div",undefined,"spam-admin-row");row.append(el("strong","#"+c.position+" "+c.name+" · "+c.cps+" CPS"));const edit=el("button","Edit");edit.type="button";edit.onclick=()=>{editing=c.id;for(const [id,v] of Object.entries({"spam-name":c.name,"spam-creator":c.creator,"spam-verifier":c.verifier,"spam-gdid":c.gd_level_id,"spam-video":c.video_url,"spam-position":c.position,"spam-cps":c.cps,"spam-duration":c.duration_seconds??"","spam-description":c.notes}))$(id).value=v;$("spam-save").textContent="Save changes";form.scrollIntoView({behavior:"smooth"});};const del=el("button","Delete");del.type="button";del.onclick=async()=>{if(!confirm("Delete this spam challenge?"))return;try{await req("/api/spam/admin/challenges/"+encodeURIComponent(c.id),{method:"DELETE"},true);await load()}catch(e){msg(e.message)}};row.append(edit,del);area.append(row);}
 }
 form.addEventListener("submit",async e=>{e.preventDefault();try{await req(editing?"/api/spam/admin/challenges/"+encodeURIComponent(editing):"/api/spam/admin/challenges",{method:editing?"PUT":"POST",body:JSON.stringify(readForm())},true);editing=null;form.reset();$("spam-save").textContent="Add challenge";msg("Challenge saved.");await load()}catch(e){msg(e.message)}});
 $("spam-cancel").onclick=()=>{editing=null;form.reset();$("spam-save").textContent="Add challenge";};
 async function reviews(){const {submissions}=await req("/api/spam/admin/submissions",{},true);const area=$("spam-review-list");area.replaceChildren();for(const s of submissions){const row=el("article",undefined,"spam-admin-row");row.append(el("strong",s.challenge_name+" · "+s.player_name+" · "+s.status),link("Evidence",s.evidence_url),el("p",s.notes));if(s.status==="pending"){const note=el("textarea");note.placeholder="Review note (optional)";row.append(note);for(const decision of ["approved","rejected"]){const btn=el("button",decision==="approved"?"Approve":"Reject");btn.onclick=async()=>{try{await req("/api/spam/admin/submissions/"+encodeURIComponent(s.id),{method:"PUT",body:JSON.stringify({status:decision,review_note:note.value.trim()})},true);msg("Record "+decision+".");await reviews()}catch(e){msg(e.message)}};row.append(btn);}}area.append(row);}}
 await Promise.all([...(editor.hidden?[]:[load()]),reviews()]);msg("Staff tools ready.");
}
(async()=>{try{if(mode==="list")await list();else if(mode==="leaderboard")await leaderboard();else if(mode==="submit")await submit();else if(mode==="admin")await admin();}catch(e){msg(e.message)}})();
})();