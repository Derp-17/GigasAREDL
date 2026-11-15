const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowedOrigin = env.SITE_ORIGIN;
  if (!origin || !allowedOrigin || origin !== allowedOrigin) return {};
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") {
      if (!cors["Access-Control-Allow-Origin"]) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "gigas-challenge-list-api" }, 200, cors);
    }

    if (url.pathname === "/api/levels" && request.method === "GET") {
      if (!env.DB) return json({ ok: false, error: "D1 binding is not configured." }, 503, cors);

      const rawLimit = Number.parseInt(url.searchParams.get("limit") || "75", 10);
      const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 150) : 75;
      const status = url.searchParams.get("status") || "active";
      const allowedStatuses = new Set(["active", "extended", "legacy"]);
      if (!allowedStatuses.has(status)) {
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

    return json({ ok: false, error: "Not found." }, 404, cors);
  }
};
