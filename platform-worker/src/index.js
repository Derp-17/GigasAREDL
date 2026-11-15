const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.SITE_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
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
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: cors["Access-Control-Allow-Origin"] ? 204 : 403, headers: cors });
    }
    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "gigas-challenge-list-api" }, 200, cors);
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
        return json({ ok: true, levels: result.results || [] }, 200, cors);
      } catch {
        return json({ ok: false, error: "Database query failed." }, 500, cors);
      }
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

    if (url.pathname === "/api/admin/me" || url.pathname === "/api/admin/levels") {
      if (!env.DB || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
        return json({ ok: false, error: "Admin service unavailable." }, 503, cors);
      let user;
      try { user = await authenticatedUser(request, env); }
      catch { return json({ ok: false, error: "Authentication service unavailable." }, 503, cors); }
      if (!user) return json({ ok: false, error: "Sign in required." }, 401, cors);
      try {
        const access = await env.DB.prepare("SELECT role FROM moderator_roles WHERE user_id = ?").bind(user.id).first();
        if (!access || !["owner", "admin"].includes(access.role))
          return json({ ok: false, error: "Admin access required." }, 403, cors);
        if (url.pathname === "/api/admin/me" && request.method === "GET")
          return json({ ok: true, role: access.role }, 200, cors);
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
            env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'create_level', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ name: name.trim(), list_status }))
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
        if (!role || !["owner", "admin", "moderator"].includes(role.role))
          return json({ ok: false, error: "Staff access required." }, 403, cors);
        const canEditLevels = ["owner", "admin"].includes(role.role);
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
              env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'delete_level', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ name: old.name }))
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
            env.DB.prepare("INSERT INTO moderation_audit_log (id, actor_user_id, action, target_type, target_id, details_json) VALUES (?, ?, 'edit_level', 'level', ?, ?)").bind(crypto.randomUUID(), user.id, id, JSON.stringify({ name: name.trim(), list_status }))
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
        const records = rows.results || [];
        const victories = new Map();
        for (const r of records) if (r.percent === 100 && r.list_status !== "unlisted" && !victories.has(r.level_id)) victories.set(r.level_id, r);
        const points = [...victories.values()].reduce((total, r) => total + (Number(r.points) || 0), 0);
        return json({ ok: true, records, victor_count: victories.size, points }, 200, cors);
      } catch { return json({ ok: false, error: "Could not load player records." }, 500, cors); }
    }

    return json({ ok: false, error: "Not found." }, 404, cors);
  }
};
