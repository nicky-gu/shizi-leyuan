/* Pages Function: /sync/:code
   GET    读取进度
   POST   保存进度 { code, data }
   KV 绑定变量名: SYNC_KV */
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

async function saveProgress(env, rawCode, data) {
  const code = (rawCode || "").toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: "同步码格式错误" }, 400);
  if (!data || typeof data !== "object") return json({ error: "缺少 data" }, 400);
  const payload = JSON.stringify(data);
  if (payload.length > 100 * 1024) return json({ error: "数据过大" }, 413);
  await env.SYNC_KV.put("progress:" + code, payload, { expirationTtl: 90 * 24 * 3600 });
  return json({ ok: true, code, savedAt: Date.now() }, 200);
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet(context) {
  try {
    const code = (context.params.code || "").toUpperCase();
    if (!CODE_RE.test(code)) return json({ error: "同步码格式错误" }, 400);
    const val = await context.env.SYNC_KV.get("progress:" + code);
    if (!val) return json({ error: "同步码不存在" }, 404);
    return new Response(val, { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    return json({ error: "server error", detail: String(e && e.message || e) }, 500);
  }
}

export async function onRequestPost(context) {
  try {
    let body;
    try { body = await context.request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
    return await saveProgress(context.env, body.code, body.data);
  } catch (e) {
    return json({ error: "server error", detail: String(e && e.message || e) }, 500);
  }
}
