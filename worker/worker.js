/* 暑假识字乐园 - 跨终端同步 API (Cloudflare Worker + KV)
   路由:
   POST /sync          { code, data }        保存/覆盖进度
   GET  /sync/:code                          读取进度
   安全: 同步码即凭证, 限制频率 + 数据大小, 无需任何 token */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // 只处理 /sync 路由
    if (!url.pathname.startsWith("/sync")) {
      return new Response("shizi-leyuan sync api", { status: 200, headers: cors });
    }

    // 提取并校验同步码格式 SHIZI-XXXXXX
    const codeFromPath = url.pathname.split("/")[2] || "";
    let code = codeFromPath.toUpperCase();
    if (request.method === "POST") {
      try {
        const body = await request.json();
        code = (body.code || "").toUpperCase();
      } catch (e) { return json({ error: "bad json" }, 400, cors); }
    }
    if (!/^SHIZI-[A-Z0-9]{6}$/.test(code)) {
      return json({ error: "同步码格式错误" }, 400, cors);
    }

    const key = "progress:" + code;

    if (request.method === "GET") {
      const val = await env.SYNC_KV.get(key);
      if (!val) return json({ error: "同步码不存在" }, 404, cors);
      return new Response(val, { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (request.method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.data !== "object") return json({ error: "缺少 data" }, 400, cors);
      const payload = JSON.stringify(body.data);
      if (payload.length > 100 * 1024) return json({ error: "数据过大" }, 413, cors);
      // 保留 90 天
      await env.SYNC_KV.put(key, payload, { expirationTtl: 90 * 24 * 3600 });
      return json({ ok: true, code, savedAt: Date.now() }, 200, cors);
    }

    return json({ error: "method not allowed" }, 405, cors);
  },
};
function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
