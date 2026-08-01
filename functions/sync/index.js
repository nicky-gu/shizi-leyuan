/* Pages Function: /sync (不带 code 的 POST 保存入口) */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet() {
  return json({ name: "shizi-leyuan sync api", usage: "GET /sync/:code 或 POST /sync {code,data}" }, 200);
}

export async function onRequestPost(context) {
  try {
    let body;
    try { body = await context.request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    const code = (body.code || "").toUpperCase();
    if (!CODE_RE.test(code)) return json({ error: "同步码格式错误" }, 400);
    if (!body.data || typeof body.data !== "object") return json({ error: "缺少 data" }, 400);
    const payload = JSON.stringify(body.data);
    if (payload.length > 100 * 1024) return json({ error: "数据过大" }, 413);
    await context.env.SYNC_KV.put("progress:" + code, payload, { expirationTtl: 90 * 24 * 3600 });
    return json({ ok: true, code, savedAt: Date.now() }, 200);
  } catch (e) {
    return json({ error: "server error", detail: String(e && e.message || e) }, 500);
  }
}
