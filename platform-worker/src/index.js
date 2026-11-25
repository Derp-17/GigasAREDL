const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.SITE_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}
async function authenticatedUser(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!/^Bearer [^\s]+$/.test(auth)) return null;
  // Supabase validates token signature, expiry, and account status server-side.
  const response = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { Authorization: auth, apikey: env.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) return null;
  const user = await response.json();
  return typeof user.id === "string" ? user : null;
}


// Custom points take precedence; otherwise points follow the current rank.
// Keep NULL in D1 for automatic values so changing placement recalculates them.
function withCalculatedPoints(level) {
  if (!level) return level;
  return { ...level, points: level.points === null || level.points === undefined
    ? (Number.isInteger(level.position) && level.position > 0 ? Math.round(100000 / level.position) / 100 : null)
    : level.points };
}
function londonSnapshotDate(instant) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", hourCycle: "h23"
  }).formatToParts(instant);
  const part = name => parts.find(p => p.type === name)?.value;
  return { date: part("year") + "-" + part("month") + "-" + part("day"), hour: part("hour") };
}
async function saveDailySnapshot(env, instant) {
  const { date, hour } = londonSnapshotDate(instant);
  if (hour !== "23") return { saved: false, reason: "Not 23:00 Europe/London." };
  const existing = await env.DB.prepare("SELECT id FROM moderation_audit_log WHERE action = 'daily_list_snapshot' AND target_id = ? LIMIT 1").bind(date).first();
  if (existing) return { saved: false, reason: "Snapshot already exists for " + date };
  const rows = await env.DB.prepare("SELECT id, name, creator, verifier, publisher, gd_level_id, verifier_video_url, thumbnail_url, position, points, list_status FROM levels ORDER BY position ASC, name ASC").all();
  const levels = rows.results || [];
  await env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json, created_at) VALUES (?, 'system:nightly-snapshot', 'daily_list_snapshot', 'history', ?, ?, ?)").bind(crypto.randomUUID(), date, JSON.stringify({ date, levels }), instant.toISOString()).run();
  return { saved: true, date, count: levels.length };
}

async function purgeDeletedAccountData(env, userId) {
  // Run after Supabase identity deletion. All statements use the same D1 batch.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM verification_submissions WHERE user_id=?").bind(userId),
    env.DB.prepare("UPDATE verification_submissions SET reviewed_by=NULL WHERE reviewed_by=?").bind(userId),
    env.DB.prepare("DELETE FROM spam_submissions WHERE user_id=?").bind(userId),
    env.DB.prepare("UPDATE spam_submissions SET reviewed_by=NULL WHERE reviewed_by=?").bind(userId),
    env.DB.prepare("DELETE FROM accepted_records WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM record_submissions WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM support_tickets WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM player_profiles WHERE user_id=?").bind(userId),
    env.DB.prepare("UPDATE record_submissions SET reviewed_by=NULL WHERE reviewed_by=?").bind(userId),
    env.DB.prepare("UPDATE accepted_records SET approved_by='deleted-user' WHERE approved_by=?").bind(userId),
    env.DB.prepare("UPDATE moderation_audit_log SET actor_user_id='deleted-user',details_json='{}' WHERE actor_user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM moderator_roles WHERE user_id=?").bind(userId),
    env.DB.prepare("DELETE FROM account_deletion_jobs WHERE user_id=?").bind(userId)
  ]);
}
async function retryAccountCleanup(env) {
  const rows=await env.DB.prepare("SELECT user_id FROM account_deletion_jobs WHERE status='auth_deleted' LIMIT 25").all();
  for (const row of rows.results || []) {
    try { await purgeDeletedAccountData(env,row.user_id); }
    catch (error) { console.error("Account cleanup retry failed",String(error)); }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(saveDailySnapshot(env, new Date(event.scheduledTime)));
    ctx.waitUntil(retryAccountCleanup(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "gigas-challenge-list-api" }, 200, cors);
    }

    if(url.pathname==="/api/verifications" || url.pathname==="/api/admin/verifications"){
      const admin=url.pathname.includes("/admin/");
      try{
        const user=await authenticatedUser(request,env);
        if(!user)return json({error:"Sign in required."},401,cors);
        if(admin){const role=await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id=?").bind(user.id).first();if(!["owner","admin"].includes(role?.role))return json({error:"Admin access required."},403,cors);}
        if(request.method==="GET"){
          const rows=admin?await env.DB.prepare("SELECT v.*,p.display_name AS username FROM verification_submissions v LEFT JOIN player_profiles p ON p.user_id=v.user_id ORDER BY CASE v.status WHEN 'pending' THEN 0 ELSE 1 END,v.created_at DESC LIMIT 500").all():await env.DB.prepare("SELECT id,list_type,name,status,review_note,created_at FROM verification_submissions WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();
          return json({submissions:rows.results||[]},200,cors);
        }
        const raw=await request.text();if(raw.length>8192)return json({error:"Request too large."},413,cors);
        let d;try{d=JSON.parse(raw)}catch{return json({error:"Invalid JSON."},400,cors)}
        if(!admin&&request.method==="POST"){
          const valid=(v,n)=>typeof v==="string"&&v.trim().length>0&&v.length<=n;
          if(!["main","spam"].includes(d.list_type)||!valid(d.name,120)||!valid(d.creator,120)||!valid(d.verifier,120)||!valid(d.gd_level_id,15)||!/^\d+$/.test(d.gd_level_id)||!valid(d.video_url,2048)||typeof d.notes!=="string"||d.notes.length>1000||!Number.isInteger(d.suggested_position)||d.suggested_position<1||d.suggested_position>100000||!Number.isFinite(d.duration_seconds)||d.duration_seconds<=0||d.duration_seconds>30||(d.list_type==="spam"&&(!Number.isFinite(d.cps)||d.cps<=0||d.cps>100)))return json({error:"Invalid verification details."},400,cors);
          let video;try{video=new URL(d.video_url)}catch{return json({error:"Invalid video URL."},400,cors)}
          if(video.protocol!=="https:"||video.username||video.password)return json({error:"HTTPS video URL required."},400,cors);
          const id=crypto.randomUUID();
          await env.DB.prepare("INSERT INTO verification_submissions(id,user_id,list_type,name,creator,verifier,gd_level_id,video_url,suggested_position,cps,duration_seconds,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,user.id,d.list_type,d.name.trim(),d.creator.trim(),d.verifier.trim(),d.gd_level_id,video.href,d.suggested_position,d.list_type==="spam"?d.cps:null,d.duration_seconds,d.notes.trim()).run();
          return json({ok:true,id},201,cors);
        }
        if(admin&&request.method==="PUT"){
          if(typeof d.id!=="string"||!["approved","rejected"].includes(d.status)||typeof d.review_note!=="string"||d.review_note.length>1000)return json({error:"Invalid review."},400,cors);
          const v=await env.DB.prepare("SELECT * FROM verification_submissions WHERE id=? AND status='pending'").bind(d.id).first();if(!v)return json({error:"Pending verification not found."},404,cors);
          const statements=[];
          if(d.status==="approved"){
            if(!Number.isInteger(d.position)||d.position<1||d.position>100000)return json({error:"Choose a valid placement."},400,cors);
            const table=v.list_type==="spam"?"spam_challenges":"levels";
            const existing=await env.DB.prepare("SELECT id FROM "+table+" WHERE gd_level_id=? OR position=?").bind(v.gd_level_id,d.position).first();if(existing)return json({error:"Level ID or placement already exists. Choose a vacant placement."},409,cors);
            if(v.list_type==="spam")statements.push(env.DB.prepare("INSERT INTO spam_challenges(id,name,creator,verifier,gd_level_id,video_url,position,cps,duration_seconds,notes) SELECT id,name,creator,verifier,gd_level_id,video_url,?,cps,duration_seconds,notes FROM verification_submissions WHERE id=? AND status='pending'").bind(d.position,v.id));
            else statements.push(env.DB.prepare("INSERT INTO levels(id,name,creator,verifier,publisher,gd_level_id,verifier_video_url,position,points,list_status,source) SELECT id,name,creator,verifier,creator,gd_level_id,video_url,?,NULL,'active','manual' FROM verification_submissions WHERE id=? AND status='pending'").bind(d.position,v.id));
          }
          statements.push(env.DB.prepare("UPDATE verification_submissions SET status=?,review_note=?,reviewed_by=? WHERE id=? AND status='pending'").bind(d.status,d.review_note,user.id,v.id));
          await env.DB.batch(statements);return json({ok:true},200,cors);
        }
        return json({error:"Method not allowed."},405,cors);
      }catch(e){return json({error:"Verification request failed. Check migration and placement."},500,cors);}
    }

    // Spam rankings are entirely independent of regular list points.
    if (url.pathname === "/api/spam/challenges" && request.method === "GET") {
      try {
        const rows = await env.DB.prepare("SELECT id,name,creator,verifier,gd_level_id,video_url,position,cps,duration_seconds,notes FROM spam_challenges ORDER BY position ASC LIMIT 500").all();
        return json({ok:true,challenges:rows.results||[]},200,cors);
      } catch { return json({ok:false,error:"Spam list is not configured yet. Apply the D1 migration."},503,cors); }
    }
    if (url.pathname === "/api/spam/leaderboard" && request.method === "GET") {
      try {
        const rows = await env.DB.prepare("SELECT p.display_name AS username, COUNT(*) AS victories, ROUND(SUM(1000.0/c.position),2) AS points FROM spam_submissions s JOIN spam_challenges c ON c.id=s.challenge_id JOIN player_profiles p ON p.user_id=s.user_id WHERE s.status='approved' GROUP BY s.user_id,p.display_name ORDER BY points DESC,victories DESC,username COLLATE NOCASE LIMIT 100").all();
        return json({ok:true,players:rows.results||[]},200,cors);
      } catch { return json({ok:false,error:"Spam leaderboard is not configured yet."},503,cors); }
    }
    if (url.pathname.startsWith("/api/spam/")) {
      if (!env.DB) return json({ok:false,error:"Database unavailable."},503,cors);
      let user;
      try { user=await authenticatedUser(request,env); }
      catch { return json({ok:false,error:"Authentication service unavailable."},503,cors); }
      if (!user) return json({ok:false,error:"Sign in required."},401,cors);
      try {
        const staff=await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id=?").bind(user.id).first();
        const canModerate=staff && ["owner","admin","moderator"].includes(staff.role);
        const canEdit=staff && ["owner","admin"].includes(staff.role);
        const route=url.pathname;
        if (route==="/api/spam/submissions" && request.method==="GET") {
          const rows=await env.DB.prepare("SELECT s.id,s.challenge_id,c.name AS challenge_name,s.evidence_url,s.notes,s.status,s.review_note,s.submitted_at FROM spam_submissions s JOIN spam_challenges c ON c.id=s.challenge_id WHERE s.user_id=? ORDER BY s.submitted_at DESC LIMIT 100").bind(user.id).all();
          return json({ok:true,submissions:rows.results||[]},200,cors);
        }
        if (route==="/api/spam/submissions" && request.method==="POST") {
          const raw=await request.text();
          if(raw.length>4096) return json({ok:false,error:"Request too large."},413,cors);
          let d;try{d=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON."},400,cors)}
          if(typeof d.challenge_id!=="string"||typeof d.evidence_url!=="string"||typeof d.notes!=="string"||d.notes.length>1000||d.evidence_url.length>2048)
            return json({ok:false,error:"Invalid submission."},400,cors);
          let video;try{video=new URL(d.evidence_url)}catch{return json({ok:false,error:"Invalid video URL."},400,cors)}
          if(video.protocol!=="https:"||video.username||video.password||!["youtube.com","www.youtube.com","youtu.be","medal.tv","www.medal.tv","twitch.tv","www.twitch.tv"].includes(video.hostname))
            return json({ok:false,error:"Use a YouTube, Medal or Twitch HTTPS video."},400,cors);
          const profile=await env.DB.prepare("SELECT user_id FROM player_profiles WHERE user_id=?").bind(user.id).first();
          if(!profile)return json({ok:false,error:"Create your profile first."},403,cors);
          const challenge=await env.DB.prepare("SELECT id FROM spam_challenges WHERE id=?").bind(d.challenge_id).first();
          if(!challenge)return json({ok:false,error:"Challenge not found."},404,cors);
          const existing=await env.DB.prepare("SELECT id FROM spam_submissions WHERE user_id=? AND challenge_id=? AND status IN ('pending','approved') LIMIT 1").bind(user.id,d.challenge_id).first();
          if(existing)return json({ok:false,error:"You already have a pending or approved record for this challenge."},409,cors);
          const id=crypto.randomUUID();
          await env.DB.prepare("INSERT INTO spam_submissions(id,challenge_id,user_id,evidence_url,notes) VALUES(?,?,?,?,?)").bind(id,d.challenge_id,user.id,video.href,d.notes.trim()).run();
          return json({ok:true,id,status:"pending"},201,cors);
        }
        if(route==="/api/spam/admin/challenges" && request.method==="POST") {
          if(!canEdit)return json({ok:false,error:"Admin access required."},403,cors);
          const raw=await request.text();if(raw.length>4096)return json({ok:false,error:"Request too large."},413,cors);
          let d;try{d=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON."},400,cors)}
          const validString=(v,max)=>typeof v==="string"&&v.length<=max;
          if(!validString(d.name,120)||!d.name.trim()||!validString(d.creator,120)||!validString(d.verifier,120)||!validString(d.gd_level_id,15)||!/^[0-9]*$/.test(d.gd_level_id)||!validString(d.video_url,2048)||!validString(d.notes,1000)||!Number.isInteger(d.position)||d.position<1||d.position>100000||typeof d.cps!=="number"||!Number.isFinite(d.cps)||d.cps<=0||d.cps>100||(d.duration_seconds!==null&&(typeof d.duration_seconds!=="number"||!Number.isFinite(d.duration_seconds)||d.duration_seconds<=0||d.duration_seconds>3600)))
            return json({ok:false,error:"Invalid challenge details."},400,cors);
          if(d.video_url){let v;try{v=new URL(d.video_url)}catch{return json({ok:false,error:"Invalid video URL."},400,cors)}if(v.protocol!=="https:"||v.username||v.password)return json({ok:false,error:"Video URL must use HTTPS."},400,cors)}
          const id=crypto.randomUUID();
          await env.DB.prepare("INSERT INTO spam_challenges(id,name,creator,verifier,gd_level_id,video_url,position,cps,duration_seconds,notes) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,d.name.trim(),d.creator.trim(),d.verifier.trim(),d.gd_level_id,d.video_url,d.position,d.cps,d.duration_seconds,d.notes.trim()).run();
          return json({ok:true,id},201,cors);
        }
        if((route.startsWith("/api/spam/admin/challenges/") && route.split("/").length===6) && ["PUT","DELETE"].includes(request.method)) {
          if(!canEdit)return json({ok:false,error:"Admin access required."},403,cors);
          const id=decodeURIComponent(route.split("/").pop());
          if(request.method==="DELETE"){
            const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM spam_submissions WHERE challenge_id=?").bind(id).first();
            if(count.n)return json({ok:false,error:"Challenge has submissions and cannot be deleted."},409,cors);
            await env.DB.prepare("DELETE FROM spam_challenges WHERE id=?").bind(id).run();
            return json({ok:true},200,cors);
          }
          const raw=await request.text();if(raw.length>4096)return json({ok:false,error:"Request too large."},413,cors);
          let d;try{d=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON."},400,cors)}
          if(typeof d.name!=="string"||!d.name.trim()||d.name.length>120||!Number.isInteger(d.position)||d.position<1||typeof d.cps!=="number"||!Number.isFinite(d.cps)||d.cps<=0||d.cps>100||[d.creator,d.verifier,d.gd_level_id,d.video_url,d.notes].some(v=>typeof v!=="string")||d.gd_level_id.length>15||!/^[0-9]*$/.test(d.gd_level_id)||d.video_url.length>2048||d.notes.length>1000||(d.duration_seconds!==null&&(!Number.isFinite(d.duration_seconds)||d.duration_seconds<=0||d.duration_seconds>3600)))return json({ok:false,error:"Invalid challenge details."},400,cors);
          if(d.video_url){let v;try{v=new URL(d.video_url)}catch{return json({ok:false,error:"Invalid video URL."},400,cors)}if(v.protocol!=="https:"||v.username||v.password)return json({ok:false,error:"Video URL must use HTTPS."},400,cors)}
          await env.DB.prepare("UPDATE spam_challenges SET name=?,creator=?,verifier=?,gd_level_id=?,video_url=?,position=?,cps=?,duration_seconds=?,notes=? WHERE id=?").bind(d.name.trim(),d.creator,d.verifier,d.gd_level_id,d.video_url,d.position,d.cps,d.duration_seconds,d.notes,id).run();
          return json({ok:true},200,cors);
        }
        if(route==="/api/spam/admin/submissions" && request.method==="GET"){
          if(!canEdit)return json({ok:false,error:"Staff access required."},403,cors);
          const rows=await env.DB.prepare("SELECT s.id,s.challenge_id,c.name AS challenge_name,COALESCE(p.display_name,'Unknown') AS player_name,s.evidence_url,s.notes,s.status,s.review_note,s.submitted_at FROM spam_submissions s JOIN spam_challenges c ON c.id=s.challenge_id LEFT JOIN player_profiles p ON p.user_id=s.user_id ORDER BY CASE WHEN s.status='pending' THEN 0 ELSE 1 END,s.submitted_at DESC LIMIT 500").all();
          return json({ok:true,submissions:rows.results||[]},200,cors);
        }
        if((route.startsWith("/api/spam/admin/submissions/") && route.split("/").length===6)&&request.method==="PUT"){
          if(!canEdit)return json({ok:false,error:"Staff access required."},403,cors);
          const id=decodeURIComponent(route.split("/").pop());
          const raw=await request.text();if(raw.length>2048)return json({ok:false,error:"Request too large."},413,cors);
          let d;try{d=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON."},400,cors)}
          if(!["approved","rejected"].includes(d.status)||typeof d.review_note!=="string"||d.review_note.length>1000)return json({ok:false,error:"Invalid review."},400,cors);
          const old=await env.DB.prepare("SELECT id FROM spam_submissions WHERE id=? AND status='pending'").bind(id).first();
          if(!old)return json({ok:false,error:"Pending submission not found."},404,cors);
          await env.DB.prepare("UPDATE spam_submissions SET status=?,review_note=?,reviewed_by=?,reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status='pending'").bind(d.status,d.review_note,user.id,id).run();
          return json({ok:true},200,cors);
        }
        return json({ok:false,error:"Not found."},404,cors);
      } catch(error) {
        if(String(error).includes("UNIQUE constraint"))return json({ok:false,error:"This ranking position or record already exists."},409,cors);
        return json({ok:false,error:"Spam list database request failed."},500,cors);
      }
    }


    if(url.pathname==="/api/staff" && request.method==="GET"){
      try{const rows=await env.DB.prepare("SELECT p.display_name AS username,r.role FROM moderator_roles r JOIN player_profiles p ON p.user_id=r.user_id ORDER BY CASE r.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,p.display_name COLLATE NOCASE").all();return json({ok:true,staff:rows.results||[]},200,cors);}catch{return json({ok:false,error:"Staff directory unavailable."},500,cors);}
    }
    // Owner-only staff role management. The target must already have a profile.
    if (url.pathname === "/api/admin/staff" && ["GET","PUT","DELETE"].includes(request.method)) {
      if (!env.DB) return json({ok:false,error:"Database unavailable."},503,cors);
      let user;try{user=await authenticatedUser(request,env)}catch{return json({ok:false,error:"Authentication unavailable."},503,cors)}
      if(!user)return json({ok:false,error:"Sign in required."},401,cors);
      try {
        const caller=await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id=?").bind(user.id).first();
        if(caller?.role!=="owner")return json({ok:false,error:"Only the owner can manage staff roles."},403,cors);
        if(request.method==="GET"){
          const rows=await env.DB.prepare("SELECT r.user_id,r.role,r.created_at,p.display_name AS username FROM moderator_roles r LEFT JOIN player_profiles p ON p.user_id=r.user_id ORDER BY CASE r.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 ELSE 3 END,p.display_name COLLATE NOCASE").all();
          return json({ok:true,staff:rows.results||[],current_user_id:user.id},200,cors);
        }
        if(!request.headers.get("Content-Type")?.startsWith("application/json"))return json({ok:false,error:"Expected JSON."},415,cors);
        const raw=await request.text();if(raw.length>1024)return json({ok:false,error:"Request too large."},413,cors);
        let d;try{d=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON."},400,cors)}
        if(typeof d.username!=="string"||! /^[A-Za-z0-9_]{3,24}$/.test(d.username))return json({ok:false,error:"Enter an existing username."},400,cors);
        const target=await env.DB.prepare("SELECT user_id,display_name FROM player_profiles WHERE display_name=? COLLATE NOCASE").bind(d.username).first();
        if(!target)return json({ok:false,error:"User profile not found."},404,cors);
        if(target.user_id===user.id)return json({ok:false,error:"You cannot change your own owner role."},403,cors);
        const existing=await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id=?").bind(target.user_id).first();
        
        if(request.method==="PUT"){
          if(!["owner","admin","moderator","helper"].includes(d.role))return json({ok:false,error:"Choose Owner, Admin, Moderator or Helper."},400,cors);
          await env.DB.batch([
            env.DB.prepare("INSERT INTO moderator_roles(user_id,role,granted_by) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,granted_by=excluded.granted_by WHERE moderator_roles.role!='owner' OR excluded.role='owner' OR EXISTS(SELECT 1 FROM moderator_roles r WHERE r.role='owner' AND r.user_id!=moderator_roles.user_id)").bind(target.user_id,d.role,user.id),
            env.DB.prepare("INSERT INTO moderation_audit_log(id,actor_user_id,action,target_type,target_id,details_json) VALUES(?,?,'staff_role_changed','user',?,?)").bind(crypto.randomUUID(),user.id,target.user_id,JSON.stringify({username:target.display_name,from:existing?.role||null,to:d.role}))
          ]);
          return json({ok:true,username:target.display_name,role:d.role},200,cors);
        }
        if(!existing)return json({ok:false,error:"This user is not staff."},404,cors);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM moderator_roles WHERE user_id=? AND (role!='owner' OR EXISTS(SELECT 1 FROM moderator_roles WHERE role='owner' AND user_id!=?))").bind(target.user_id,target.user_id),
          env.DB.prepare("INSERT INTO moderation_audit_log(id,actor_user_id,action,target_type,target_id,details_json) VALUES(?,?,'staff_role_removed','user',?,?)").bind(crypto.randomUUID(),user.id,target.user_id,JSON.stringify({username:target.display_name,from:existing.role}))
        ]);
        return json({ok:true,removed:true},200,cors);
      }catch{return json({ok:false,error:"Staff role update failed."},500,cors)}
    }
    if (url.pathname === "/api/levels" && request.method === "GET") {
      if (!env.DB) return json({ ok: false, error: "D1 binding is not configured." }, 503, cors);
      const rawLimit = Number.parseInt(url.searchParams.get("limit") || "75", 10);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 75;
      const status = url.searchParams.get("status") || "active";
      if (!new Set(["active", "extended", "legacy"]).has(status)) {
        return json({ ok: false, error: "Invalid list status." }, 400, cors);
      }
      try {
        const result = await env.DB.prepare(
          "SELECT id, external_aredl_id, gd_level_id, name, creator, verifier, publisher, verifier_video_url, thumbnail_url, position, points, list_status FROM levels WHERE list_status = ? ORDER BY position IS NULL, position ASC, name COLLATE NOCASE ASC LIMIT ?"
        ).bind(status, limit).all();
        return json({ ok: true, levels: (result.results || []).map(withCalculatedPoints) }, 200, cors);
      } catch {
        return json({ ok: false, error: "Database query failed." }, 500, cors);
      }
    }

    if (url.pathname === "/api/leaderboard" && request.method === "GET") {
      try {
        const result = await env.DB.prepare("SELECT p.display_name AS username, COUNT(DISTINCT r.level_id) AS victories, ROUND(COALESCE(SUM(COALESCE(l.points, CASE WHEN l.position > 0 THEN 1000.0 / l.position ELSE 0 END)), 0), 2) AS points FROM player_profiles p JOIN (SELECT user_id, level_id FROM accepted_records WHERE percent = 100 GROUP BY user_id, level_id) r ON r.user_id = p.user_id JOIN levels l ON l.id = r.level_id AND l.list_status != 'unlisted' GROUP BY p.user_id, p.display_name ORDER BY points DESC, victories DESC, username COLLATE NOCASE ASC LIMIT 100").all();
        return json({ ok: true, players: result.results || [] }, 200, cors);
      } catch { return json({ ok: false, error: "Could not load leaderboard." }, 500, cors); }
    }
    if (url.pathname === "/api/history" && request.method === "GET") {
      const date = url.searchParams.get("date");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0,10) !== date)
        return json({ ok: false, error: "Enter a valid date." }, 400, cors);
      const today = londonSnapshotDate(new Date()).date;
      if (date > today) return json({ ok: false, error: "Future dates are unavailable." }, 400, cors);
      try {
        const row = await env.DB.prepare("SELECT target_id, details_json FROM moderation_audit_log WHERE action = 'daily_list_snapshot' AND target_id <= ? ORDER BY target_id DESC LIMIT 1").bind(date).first();
        if (!row) return json({ ok: true, levels: [], tracking_started: false, snapshot_date: null }, 200, cors);
        const data = JSON.parse(row.details_json);
        const levels = (data.levels || []).filter(l => ["active","extended","legacy"].includes(l.list_status))
          .sort((a,b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name));
        return json({ ok: true, levels, tracking_started: true, snapshot_date: row.target_id, exact_date: row.target_id === date }, 200, cors);
      } catch { return json({ ok: false, error: "Could not load historical rankings." }, 500, cors); }
    }
    if (url.pathname.startsWith("/api/players/") && request.method === "GET") {
      const username = decodeURIComponent(url.pathname.slice("/api/players/".length));
      if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return json({ ok: false, error: "Invalid username." }, 400, cors);
      try {
        const profile = await env.DB.prepare("SELECT display_name, bio, avatar_url, created_at FROM player_profiles WHERE display_name = ? COLLATE NOCASE").bind(username).first();
        return profile ? json({ ok: true, profile }, 200, cors) : json({ ok: false, error: "Player not found." }, 404, cors);
      } catch { return json({ ok: false, error: "Database query failed." }, 500, cors); }
    }
    if (url.pathname === "/api/me" && ["GET", "PUT"].includes(request.method)) {
      if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
        return json({ ok: false, error: "Account service is not configured." }, 503, cors);
      }
      let user;
      try { user = await authenticatedUser(request, env); }
      catch { return json({ ok: false, error: "Authentication service unavailable." }, 503, cors); }
      if (!user) return json({ ok: false, error: "Sign in required." }, 401, cors);
      if (request.method === "GET") {
        try {
          const profile = await env.DB.prepare("SELECT user_id, display_name, bio, avatar_url, created_at, updated_at FROM player_profiles WHERE user_id = ?").bind(user.id).first();
          return json({ ok: true, profile: profile || null }, 200, cors);
        } catch { return json({ ok: false, error: "Database query failed." }, 500, cors); }
      }
      if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
        return json({ ok: false, error: "Expected JSON." }, 415, cors);
      }
      let payload;
      try {
        if (Number(request.headers.get("Content-Length")) > 4096) return json({ ok: false, error: "Request too large." }, 413, cors);
        const body = await request.text();
        if (body.length > 4096) return json({ ok: false, error: "Request too large." }, 413, cors);
        payload = JSON.parse(body);
      } catch { return json({ ok: false, error: "Invalid JSON." }, 400, cors); }
      const name = payload?.username;
      const bio = payload?.bio ?? "";
      if (typeof name !== "string" || !/^[A-Za-z0-9_]{3,24}$/.test(name)) {
        return json({ ok: false, error: "Username must be 3–24 letters, numbers, or underscores." }, 400, cors);
      }
      if (typeof bio !== "string" || bio.length > 300) {
        return json({ ok: false, error: "Bio must be at most 300 characters." }, 400, cors);
      }
      try {
        await env.DB.prepare(
          "INSERT INTO player_profiles (user_id, display_name, bio) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, bio = excluded.bio, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
        ).bind(user.id, name, bio).run();
        const profile = await env.DB.prepare("SELECT user_id, display_name, bio, avatar_url, created_at, updated_at FROM player_profiles WHERE user_id = ?").bind(user.id).first();
        return json({ ok: true, profile }, 200, cors);
      } catch (error) {
        if (/UNIQUE constraint failed/i.test(String(error))) return json({ ok: false, error: "Username is already taken." }, 409, cors);
        return json({ ok: false, error: "Could not save profile." }, 500, cors);
      }
    }


    // Authenticated support requests, staff replies, and account-data export.
    if (url.pathname === "/api/support/tickets" || /^\/api\/support\/tickets\/[^/]+$/.test(url.pathname) ||
        url.pathname === "/api/admin/support/tickets" || /^\/api\/admin\/support\/tickets\/[^/]+$/.test(url.pathname) ||
        url.pathname === "/api/account/export" || url.pathname === "/api/account/delete-request" || url.pathname === "/api/account/delete") {
      if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
        return json({ ok: false, error: "Account service unavailable." }, 503, cors);
      let user;
      try { user = await authenticatedUser(request, env); }
      catch { return json({ ok: false, error: "Authentication service unavailable." }, 503, cors); }
      if (!user) return json({ ok: false, error: "Sign in required." }, 401, cors);
      const adminRoute = url.pathname.startsWith("/api/admin/");
      try {
        if (adminRoute) {
          const role = await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id = ?").bind(user.id).first();
          if (!role || !["owner","admin","moderator"].includes(role.role))
            return json({ ok: false, error: "Staff access required." }, 403, cors);
        }
        if (url.pathname === "/api/account/delete" && request.method === "POST") {
          if (!env.SUPABASE_SERVICE_ROLE_KEY)
            return json({ok:false,error:"Automatic deletion is not configured yet. Contact support."},503,cors);
          if (!request.headers.get("Content-Type")?.startsWith("application/json"))
            return json({ok:false,error:"Expected JSON."},415,cors);
          const raw=await request.text();
          if(raw.length>1000)return json({ok:false,error:"Request too large."},413,cors);
          let data;try{data=JSON.parse(raw);}catch{return json({ok:false,error:"Invalid JSON."},400,cors);}
          if(data?.confirmation!=="DELETE MY ACCOUNT")
            return json({ok:false,error:"Type DELETE MY ACCOUNT to confirm."},400,cors);
          const role=await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id=?").bind(user.id).first();
          if(role)return json({ok:false,error:"Staff accounts cannot be self-deleted. Contact the site owner."},403,cors);
          const job=await env.DB.prepare("SELECT status FROM account_deletion_jobs WHERE user_id=?").bind(user.id).first();
          if(job)return json({ok:false,error:"An account deletion is already being processed."},409,cors);
          // Record a recovery job BEFORE removing the identity.
          await env.DB.prepare("INSERT INTO account_deletion_jobs(user_id) VALUES(?)").bind(user.id).run();
          let response;
          try {
            response=await fetch(env.SUPABASE_URL+"/auth/v1/admin/users/"+encodeURIComponent(user.id),{
              method:"DELETE",
              headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:"Bearer "+env.SUPABASE_SERVICE_ROLE_KEY},
              signal:AbortSignal.timeout(10000)
            });
          } catch {
            // Network timeout could mean the delete succeeded. Keep job for staff reconciliation.
            return json({ok:false,error:"Deletion status is uncertain. Contact support; do not create another account yet."},503,cors);
          }
          if(!response.ok){
            await env.DB.prepare("DELETE FROM account_deletion_jobs WHERE user_id=? AND status='pending'").bind(user.id).run();
            return json({ok:false,error:"Could not remove the login account. Contact support."},502,cors);
          }
          await env.DB.prepare("UPDATE account_deletion_jobs SET status='auth_deleted',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id=?").bind(user.id).run();
          try {
            await purgeDeletedAccountData(env,user.id);
            return json({ok:true,deleted:true},200,cors);
          } catch {
            // Cron will retry removal of D1 personal data.
            return json({ok:true,deleted:false,processing:true,message:"Login removed. Remaining data cleanup is processing."},202,cors);
          }
        }
        if (url.pathname === "/api/account/export" && request.method === "GET") {
          const [profile, submissions, records, tickets, spamSubmissions] = await Promise.all([
            env.DB.prepare("SELECT display_name,bio,avatar_url,created_at,updated_at FROM player_profiles WHERE user_id = ?").bind(user.id).first(),
            env.DB.prepare("SELECT id,level_id,percent,evidence_url,notes,status,review_note,submitted_at,reviewed_at FROM record_submissions WHERE user_id = ? ORDER BY submitted_at DESC").bind(user.id).all(),
            env.DB.prepare("SELECT id,level_id,percent,evidence_url,approved_at FROM accepted_records WHERE user_id = ? ORDER BY approved_at DESC").bind(user.id).all(),
            env.DB.prepare("SELECT id,category,subject,message,status,staff_reply,created_at,updated_at FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all(),
            env.DB.prepare("SELECT id,challenge_id,evidence_url,notes,status,review_note,submitted_at,reviewed_at FROM spam_submissions WHERE user_id=? ORDER BY submitted_at DESC").bind(user.id).all()
          ]);
          return json({ exported_at: new Date().toISOString(), account: { id: user.id, email: user.email || null }, profile: profile || null, submissions: submissions.results || [], accepted_records: records.results || [], support_tickets: tickets.results || [], spam_submissions: spamSubmissions.results || [] }, 200, cors);
        }
        if ((url.pathname === "/api/support/tickets" || url.pathname === "/api/admin/support/tickets") && request.method === "GET") {
          const staff = adminRoute;
          const rows = await env.DB.prepare(staff
            ? "SELECT t.*, COALESCE(p.display_name,'Unknown player') AS player_name FROM support_tickets t LEFT JOIN player_profiles p ON p.user_id=t.user_id ORDER BY CASE WHEN t.status='open' THEN 0 WHEN t.status='in_progress' THEN 1 ELSE 2 END,t.created_at DESC LIMIT 200"
            : "SELECT id,category,subject,message,status,staff_reply,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY created_at DESC LIMIT 100");
          const result = await (staff ? rows.all() : rows.bind(user.id).all());
          return json({ ok: true, tickets: result.results || [] }, 200, cors);
        }
        if ((url.pathname === "/api/support/tickets" || url.pathname === "/api/account/delete-request") && request.method === "POST") {
          if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ ok:false,error:"Expected JSON." },415,cors);
          const raw = await request.text();
          if (raw.length > 5000) return json({ ok:false,error:"Request too large." },413,cors);
          let data; try { data=JSON.parse(raw); } catch { return json({ok:false,error:"Invalid JSON."},400,cors); }
          const deletion = url.pathname === "/api/account/delete-request";
          const category = deletion ? "deletion" : data?.category;
          const subject = deletion ? "Account deletion request" : data?.subject?.trim();
          const message = deletion ? "Please delete my player data and Supabase authentication account. Contact me through this ticket if verification is needed." : data?.message?.trim();
          if (!["bug","appeal","account","general","deletion"].includes(category) || typeof subject !== "string" || subject.length < 3 || subject.length > 120 || typeof message !== "string" || message.length < 10 || message.length > 3000)
            return json({ok:false,error:"Check the category, subject (3–120 characters) and message (10–3000 characters)."},400,cors);
          if (category === "deletion") {
            const existing = await env.DB.prepare("SELECT id FROM support_tickets WHERE user_id=? AND category='deletion' AND status IN ('open','in_progress') LIMIT 1").bind(user.id).first();
            if (existing) return json({ok:true,id:existing.id,existing:true,status:"open"},200,cors);
          }
          const id=crypto.randomUUID();
          await env.DB.prepare("INSERT INTO support_tickets(id,user_id,category,subject,message) VALUES(?,?,?,?,?)").bind(id,user.id,category,subject,message).run();
          return json({ok:true,id,status:"open"},201,cors);
        }
        if (adminRoute && request.method === "PUT" && /^\/api\/admin\/support\/tickets\/[^/]+$/.test(url.pathname)) {
          if (!request.headers.get("Content-Type")?.startsWith("application/json")) return json({ok:false,error:"Expected JSON."},415,cors);
          const raw=await request.text(); if(raw.length>2500)return json({ok:false,error:"Request too large."},413,cors);
          let data; try{data=JSON.parse(raw);}catch{return json({ok:false,error:"Invalid JSON."},400,cors);}
          if (!["open","in_progress","resolved","closed"].includes(data?.status) || typeof data.staff_reply!=="string" || data.staff_reply.length>1500)
            return json({ok:false,error:"Invalid status or reply."},400,cors);
          const id=decodeURIComponent(url.pathname.slice("/api/admin/support/tickets/".length));
          const result=await env.DB.prepare("UPDATE support_tickets SET status=?,staff_reply=?,assigned_staff=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(data.status,data.staff_reply,user.id,id).run();
          if (!result.meta.changes) return json({ok:false,error:"Ticket not found."},404,cors);
          return json({ok:true},200,cors);
        }
        return json({ok:false,error:"Not found."},404,cors);
      } catch { return json({ok:false,error:"Support database unavailable. Check migration 0002."},503,cors); }
    }

    if (url.pathname === "/api/submissions" && ["GET", "POST"].includes(request.method)) {
      if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
        return json({ ok: false, error: "Submission service unavailable." }, 503, cors);
      let user;
      try { user = await authenticatedUser(request, env); }
      catch { return json({ ok: false, error: "Authentication service unavailable." }, 503, cors); }
      if (!user) return json({ ok: false, error: "Sign in required." }, 401, cors);
      try {
        if (request.method === "GET") {
          const result = await env.DB.prepare(
            "SELECT s.id, s.level_id, l.name AS level_name, s.percent, s.evidence_url, s.notes, s.status, s.review_note, s.submitted_at, s.reviewed_at FROM record_submissions s JOIN levels l ON l.id = s.level_id WHERE s.user_id = ? ORDER BY s.submitted_at DESC LIMIT 100"
          ).bind(user.id).all();
          return json({ ok: true, submissions: result.results || [] }, 200, cors);
        }
        if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json")
          return json({ ok: false, error: "Expected JSON." }, 415, cors);
        const body = await request.text();
        if (body.length > 4096) return json({ ok: false, error: "Request too large." }, 413, cors);
        let data;
        try { data = JSON.parse(body); }
        catch { return json({ ok: false, error: "Invalid JSON." }, 400, cors); }
        const { level_id, percent, evidence_url, notes = "" } = data || {};
        if (typeof level_id !== "string" || level_id.length > 128 ||
            !Number.isInteger(percent) || percent < 1 || percent > 100 ||
            typeof evidence_url !== "string" || evidence_url.length > 2048 ||
            typeof notes !== "string" || notes.length > 1000)
          return json({ ok: false, error: "Invalid submission details." }, 400, cors);
        let evidence;
        try { evidence = new URL(evidence_url); }
        catch { return json({ ok: false, error: "Invalid evidence URL." }, 400, cors); }
        if (evidence.protocol !== "https:" || !["youtube.com", "www.youtube.com", "youtu.be", "medal.tv", "www.medal.tv", "twitch.tv", "www.twitch.tv"].includes(evidence.hostname) ||
            evidence.username || evidence.password)
          return json({ ok: false, error: "Use an HTTPS YouTube, Medal, or Twitch video link." }, 400, cors);
        const profile = await env.DB.prepare("SELECT user_id FROM player_profiles WHERE user_id = ?").bind(user.id).first();
        if (!profile) return json({ ok: false, error: "Create a player profile first." }, 403, cors);
        const level = await env.DB.prepare("SELECT id FROM levels WHERE id = ? AND list_status != 'unlisted'").bind(level_id).first();
        if (!level) return json({ ok: false, error: "Challenge not found." }, 404, cors);
        const existing = await env.DB.prepare("SELECT id FROM record_submissions WHERE user_id = ? AND level_id = ? AND status = 'pending' LIMIT 1").bind(user.id, level_id).first();
        if (existing) return json({ ok: false, error: "You already have a pending submission for this challenge." }, 409, cors);
        const id = crypto.randomUUID();
        await env.DB.prepare("INSERT INTO record_submissions (id, user_id, level_id, percent, evidence_url, notes) VALUES (?, ?, ?, ?, ?, ?)").bind(id, user.id, level_id, percent, evidence.href, notes.trim()).run();
        return json({ ok: true, id, status: "pending" }, 201, cors);
      } catch {
        return json({ ok: false, error: "Submission database request failed." }, 500, cors);
      }
    }

    if (url.pathname === "/api/admin/me" || url.pathname === "/api/admin/levels" || url.pathname === "/api/admin/users") {
      if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
        return json({ ok: false, error: "Admin service unavailable." }, 503, cors);
      let user;
      try { user = await authenticatedUser(request, env); }
      catch { return json({ ok: false, error: "Authentication service unavailable." }, 503, cors); }
      if (!user) return json({ ok: false, error: "Sign in required." }, 401, cors);
      try {
        const access = await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id = ?").bind(user.id).first();
        if (!access || !["owner", "admin", "moderator", "helper"].includes(access.role))
          return json({ ok: false, error: "Admin access required." }, 403, cors);
        if (url.pathname === "/api/admin/me" && request.method === "GET")
          return json({ ok: true, role: access.role }, 200, cors);
        if (url.pathname === "/api/admin/users" && request.method === "GET") {
          // Staff can browse registered player profiles, never auth tokens or emails.
          const limit = 100;
          const offset = Number(url.searchParams.get("offset") || "0");
          if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
            return json({ ok: false, error: "Invalid page offset." }, 400, cors);
          const query = (url.searchParams.get("q") || "").trim();
          if (query.length > 80) return json({ ok: false, error: "Search is too long." }, 400, cors);
          const pattern = "%" + query.replace(/[\\%_]/g, character => "\\" + character) + "%";
          const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM player_profiles WHERE display_name LIKE ? ESCAPE '\\'").bind(pattern).first();
          const rows = await env.DB.prepare("SELECT p.display_name, p.avatar_url, p.created_at, r.role FROM player_profiles p LEFT JOIN moderator_roles r ON r.user_id = p.user_id WHERE p.display_name LIKE ? ESCAPE '\\' ORDER BY p.created_at DESC LIMIT ? OFFSET ?").bind(pattern, limit, offset).all();
          return json({ ok: true, users: rows.results || [], total: count.total, limit, offset }, 200, cors);
        }
        if (url.pathname === "/api/admin/levels" && !["owner", "admin"].includes(access.role))
          return json({ ok: false, error: "Admin access required." }, 403, cors);
        if (url.pathname === "/api/admin/levels" && request.method === "POST") {
          if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json")
            return json({ ok: false, error: "Expected JSON." }, 415, cors);
          const raw = await request.text();
          if (raw.length > 4096) return json({ ok: false, error: "Request too large." }, 413, cors);
          let data;
          try { data = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid JSON." }, 400, cors); }
          const { name, creator = "", verifier = "", publisher = "", gd_level_id = "", verifier_video_url = "", position = null, points = null, list_status = "active" } = data || {};
          if (typeof name !== "string" || !name.trim() || name.length > 120 ||
              [creator, verifier, publisher].some(v => typeof v !== "string" || v.length > 120) ||
              typeof gd_level_id !== "string" || !/^\d{0,15}$/.test(gd_level_id) ||
              typeof verifier_video_url !== "string" || verifier_video_url.length > 2048 ||
              (position !== null && (!Number.isInteger(position) || position < 1 || position > 100000)) ||
              (points !== null && (typeof points !== "number" || !Number.isFinite(points) || points < 0 || points > 1000000)) ||
              !["active", "extended", "legacy", "unlisted"].includes(list_status))
            return json({ ok: false, error: "Invalid challenge details." }, 400, cors);
          if (verifier_video_url) {
            let video;
            try { video = new URL(verifier_video_url); }
            catch { return json({ ok: false, error: "Invalid verifier video URL." }, 400, cors); }
            if (video.protocol !== "https:" || video.username || video.password)
              return json({ ok: false, error: "Verifier video must be an HTTPS URL." }, 400, cors);
          }
          const id = crypto.randomUUID();
          await env.DB.batch([
            env.DB.prepare("INSERT INTO levels (id, name, creator, verifier, publisher, gd_level_id, verifier_video_url, position, points, list_status, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')").bind(id, name.trim(), creator.trim(), verifier.trim(), publisher.trim(), gd_level_id || null, verifier_video_url || null, position, points, list_status),
            env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'create_level', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ id, name: name.trim(), creator: creator.trim(), verifier: verifier.trim(), publisher: publisher.trim(), gd_level_id, verifier_video_url, position, points, list_status })),
            env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'level_snapshot', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ id, name: name.trim(), creator: creator.trim(), verifier: verifier.trim(), publisher: publisher.trim(), gd_level_id, verifier_video_url, position, points, list_status }))
          ]);
          return json({ ok: true, id }, 201, cors);
        }
    
        return json({ ok: false, error: "Not found." }, 404, cors);
      } catch {
        return json({ ok: false, error: "Admin database request failed." }, 500, cors);
      }
    }


    // All management routes are protected server-side, regardless of frontend visibility.
    if (url.pathname === "/api/admin/levels/all" || /^\/api\/admin\/levels\/[^/]+$/.test(url.pathname) ||
        url.pathname === "/api/admin/submissions" || /^\/api\/admin\/submissions\/[^/]+$/.test(url.pathname)) {
      if (!env.DB) return json({ ok: false, error: "Database unavailable." }, 503, cors);
      let user;
      try { user = await authenticatedUser(request, env); }
      catch { return json({ ok: false, error: "Authentication service unavailable." }, 503, cors); }
      if (!user) return json({ ok: false, error: "Sign in required." }, 401, cors);
      try {
        const role = await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id = ?").bind(user.id).first();
        if (!role || !["owner", "admin", "moderator", "helper"].includes(role.role))
          return json({ ok: false, error: "Staff access required." }, 403, cors);
        const canEditLevels = ["owner", "admin"].includes(role.role);
        if(role.role==="helper" && url.pathname!=="/api/admin/levels/all" && url.pathname!=="/api/admin/submissions")return json({ok:false,error:"Helpers do not have moderation permissions."},403,cors);
        if(role.role==="helper" && url.pathname!=="/api/admin/levels/all" && url.pathname!=="/api/admin/submissions" && request.method!=="GET")return json({ok:false,error:"Helpers cannot moderate records."},403,cors);
        if (url.pathname === "/api/admin/levels/all" && request.method === "GET") {
          if (!canEditLevels) return json({ ok: false, error: "Admin access required." }, 403, cors);
          const rows = await env.DB.prepare("SELECT id, name, creator, verifier, publisher, gd_level_id, verifier_video_url, position, points, list_status FROM levels ORDER BY position IS NULL, position, name LIMIT 500").all();
          return json({ ok: true, levels: rows.results || [] }, 200, cors);
        }
        if (url.pathname === "/api/admin/submissions" && request.method === "GET") {
          const rows = await env.DB.prepare("SELECT s.id, s.level_id, l.name AS level_name, s.user_id, COALESCE(p.display_name, 'Unknown') AS player_name, s.percent, s.evidence_url, s.notes, s.status, s.review_note, s.submitted_at, s.reviewed_at FROM record_submissions s JOIN levels l ON l.id = s.level_id LEFT JOIN player_profiles p ON p.user_id = s.user_id ORDER BY CASE WHEN s.status = 'pending' THEN 0 ELSE 1 END, s.submitted_at DESC LIMIT 500").all();
          return json({ ok: true, submissions: rows.results || [] }, 200, cors);
        }
        const isLevel = url.pathname.startsWith("/api/admin/levels/");
        const id = decodeURIComponent(url.pathname.split("/").pop());
        if (!/^[a-f0-9-]{36}$/.test(id)) return json({ ok: false, error: "Invalid ID." }, 400, cors);
        if (isLevel) {
          if (!canEditLevels) return json({ ok: false, error: "Admin access required." }, 403, cors);
          const old = await env.DB.prepare("SELECT * FROM levels WHERE id = ?").bind(id).first();
          if (!old) return json({ ok: false, error: "Challenge not found." }, 404, cors);
          if (request.method === "DELETE") {
            const records = await env.DB.prepare("SELECT (SELECT COUNT(*) FROM record_submissions WHERE level_id = ?) AS count").bind(id).first();
            if (records.count > 0) return json({ ok: false, error: "Challenge has submissions. Set its section to Unlisted instead to preserve player records." }, 409, cors);
            await env.DB.batch([
              env.DB.prepare("DELETE FROM levels WHERE id = ? AND NOT EXISTS (SELECT 1 FROM record_submissions WHERE level_id = ?)").bind(id, id),
              env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'delete_level', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ name: old.name })),
              env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'level_snapshot', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ ...old, list_status: "deleted" }))
            ]);
            return json({ ok: true }, 200, cors);
          }
          if (request.method !== "PUT") return json({ ok: false, error: "Method not allowed." }, 405, cors);
          if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return json({ ok: false, error: "Expected JSON." }, 415, cors);
          const raw = await request.text();
          if (raw.length > 4096) return json({ ok: false, error: "Request too large." }, 413, cors);
          let d; try { d = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid JSON." }, 400, cors); }
          const { name, creator, verifier, publisher, gd_level_id, verifier_video_url, position, points, list_status } = d || {};
          if (typeof name !== "string" || !name.trim() || name.length > 120 ||
              [creator, verifier, publisher].some(v => typeof v !== "string" || v.length > 120) ||
              typeof gd_level_id !== "string" || !/^\d{0,15}$/.test(gd_level_id) ||
              typeof verifier_video_url !== "string" || verifier_video_url.length > 2048 ||
              (position !== null && (!Number.isInteger(position) || position < 1 || position > 100000)) ||
              (points !== null && (typeof points !== "number" || !Number.isFinite(points) || points < 0 || points > 1000000)) ||
              !["active", "extended", "legacy", "unlisted"].includes(list_status))
            return json({ ok: false, error: "Invalid challenge details." }, 400, cors);
          if (verifier_video_url) {
            let u; try { u = new URL(verifier_video_url); } catch { return json({ ok: false, error: "Invalid video URL." }, 400, cors); }
            if (u.protocol !== "https:" || u.username || u.password) return json({ ok: false, error: "Video URL must be HTTPS." }, 400, cors);
          }
          await env.DB.batch([
            env.DB.prepare("UPDATE levels SET name=?, creator=?, verifier=?, publisher=?, gd_level_id=?, verifier_video_url=?, position=?, points=?, list_status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=?").bind(name.trim(), creator.trim(), verifier.trim(), publisher.trim(), gd_level_id || null, verifier_video_url || null, position, points, list_status, id),
            env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'edit_level', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ name: name.trim(), list_status })),
            env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'level_snapshot', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ ...old, name: name.trim(), creator: creator.trim(), verifier: verifier.trim(), publisher: publisher.trim(), gd_level_id, verifier_video_url, position, points, list_status }))
          ]);
          return json({ ok: true }, 200, cors);
        }
        if (request.method !== "PUT") return json({ ok: false, error: "Method not allowed." }, 405, cors);
        if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return json({ ok: false, error: "Expected JSON." }, 415, cors);
        const raw = await request.text();
        if (raw.length > 2048) return json({ ok: false, error: "Request too large." }, 413, cors);
        let d; try { d = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid JSON." }, 400, cors); }
        if (!["approved", "rejected", "needs_changes"].includes(d?.status) || typeof d?.review_note !== "string" || d.review_note.length > 500)
          return json({ ok: false, error: "Invalid review." }, 400, cors);
        const submission = await env.DB.prepare("SELECT * FROM record_submissions WHERE id = ?").bind(id).first();
        if (!submission) return json({ ok: false, error: "Submission not found." }, 404, cors);
        if (submission.status !== "pending") return json({ ok: false, error: "This submission has already been reviewed." }, 409, cors);
        const actions = [
          env.DB.prepare("UPDATE record_submissions SET status=?, review_note=?, reviewed_by=?, reviewed_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=? AND status='pending'").bind(d.status, d.review_note.trim(), user.id, id)
        ];
        if (d.status === "approved") {
          actions.push(env.DB.prepare("INSERT INTO accepted_records (id, submission_id, user_id, level_id, percent, evidence_url, approved_by) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, submission.user_id, submission.level_id, submission.percent, submission.evidence_url, user.id));
        }
        actions.push(env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, ?, 'submission', ?, ?)").bind(crypto.randomUUID(), user.id, "review_" + d.status, id, JSON.stringify({ note: d.review_note.trim() })));
        await env.DB.batch(actions);
        return json({ ok: true, status: d.status }, 200, cors);
      } catch {
        return json({ ok: false, error: "Management request failed." }, 500, cors);
      }
    }

    if (url.pathname.startsWith("/api/player-records/") && request.method === "GET") {
      const name = decodeURIComponent(url.pathname.slice("/api/player-records/".length));
      if (!/^[A-Za-z0-9_]{3,24}$/.test(name)) return json({ ok: false, error: "Invalid username." }, 400, cors);
      try {
        const player = await env.DB.prepare("SELECT user_id FROM player_profiles WHERE display_name = ? COLLATE NOCASE").bind(name).first();
        if (!player) return json({ ok: false, error: "Player not found." }, 404, cors);
        const rows = await env.DB.prepare("SELECT r.id, r.percent, r.evidence_url, r.approved_at, l.name AS level_name, l.id AS level_id, l.position, l.points, l.list_status FROM accepted_records r JOIN levels l ON l.id = r.level_id WHERE r.user_id = ? ORDER BY l.position IS NULL, l.position, r.approved_at DESC LIMIT 500").bind(player.user_id).all();
        const records = (rows.results || []).map(withCalculatedPoints);
        const victories = new Map();
        for (const r of records) if (r.percent === 100 && r.list_status !== "unlisted" && !victories.has(r.level_id)) victories.set(r.level_id, r);
        const points = [...victories.values()].reduce((total, r) => total + (Number(r.points) || 0), 0);
        return json({ ok: true, records, victor_count: victories.size, points }, 200, cors);
      } catch { return json({ ok: false, error: "Could not load player records." }, 500, cors); }
    }


    if (url.pathname.startsWith("/api/challenges/") && request.method === "GET") {
      const id = decodeURIComponent(url.pathname.slice("/api/challenges/".length));
      if (!/^[a-f0-9-]{36}$/.test(id)) return json({ ok: false, error: "Invalid challenge ID." }, 400, cors);
      try {
        const level = await env.DB.prepare("SELECT id, gd_level_id, name, creator, verifier, publisher, verifier_video_url, thumbnail_url, position, points, list_status FROM levels WHERE id = ? AND list_status != 'unlisted'").bind(id).first();
        if (!level) return json({ ok: false, error: "Challenge not found." }, 404, cors);
        const rows = await env.DB.prepare("SELECT p.display_name AS player_name, MAX(r.percent) AS percent, MIN(r.approved_at) AS approved_at FROM accepted_records r JOIN player_profiles p ON p.user_id = r.user_id WHERE r.level_id = ? AND r.percent = 100 GROUP BY r.user_id, p.display_name ORDER BY approved_at ASC LIMIT 500").bind(id).all();
        return json({ ok: true, level: withCalculatedPoints(level), victors: rows.results || [] }, 200, cors);
      } catch { return json({ ok: false, error: "Could not load challenge." }, 500, cors); }
    }
    return json({ ok: false, error: "Not found." }, 404, cors);
  }
};
