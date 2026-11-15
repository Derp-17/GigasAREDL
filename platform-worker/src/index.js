const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || origin !== env.SITE_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
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
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 150) : 75;
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
    return json({ ok: false, error: "Not found." }, 404, cors);
  }
};
