/* Pages Function: 同步 API
   GET  /sync/:code   读取进度
   POST /sync         保存进度 { code, data }
   KV 绑定变量名: SYNC_KV */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet(context) {
  const code = (context.params.code || "").toUpperCase();
  if (!/^SHIZI-[A-Z0-9]{6}$/.test(code)) return json({ error: "同步码格式错误" }, 400);
  const val = await context.env.SYNC_KV.get("progress:" + code);
  if (!val) return json({ error: "同步码不存在" }, 404);
  return new Response(val, { status: 200, headers: { ...CORS, "Content-Type": "application/json" } });
}

export async function onRequestPost(context) {
  let body;
  try { body = await context.request.json(); } catch (e) { return json({ error: "bad json" }, 400); }
  const code = (body.code || "").toUpperCase();
  if (!/^SHIZI-[A-Z0-9]{6}$/.test(code)) return json({ error: "同步码格式错误" }, 400);
  if (!body.data || typeof body.data !== "object") return json({ error: "缺少 data" }, 400);
  const payload = JSON.stringify(body.data);
  if (payload.length > 100 * 1024) return json({ error: "数据过大" }, 413);
  await context.env.SYNC_KV.put("progress:" + code, payload, { expirationTtl: 90 * 24 * 3600 });
  return json({ ok: true, code, savedAt: Date.now() }, 200);
}
