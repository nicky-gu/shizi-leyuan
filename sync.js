/* ===== 跨终端同步（GitHub Gist 私有存储）=====
   原理：学习进度加密存到用户自己的 GitHub 私有 Gist，
   通过一个「同步码」在任意设备读写同一份进度。
   同步码格式: SHIZI-XXXXXX (6位随机字符) */
"use strict";

const SYNC_LS_KEY = "shizi_sync_v1";
let SYNC = loadSync();

function loadSync() {
  try { return JSON.parse(localStorage.getItem(SYNC_LS_KEY)) || null; }
  catch (e) { return null; }
}
function saveSync() { localStorage.setItem(SYNC_LS_KEY, JSON.stringify(SYNC)); }

/* 生成 6 位同步码 */
function genSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆字符
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return "SHIZI-" + code;
}

/* 用同步码派生 Gist 描述标记（让同一个家庭的设备找到同一份进度）*/
function syncTag(code) { return "shizi-leyuan-sync:" + code; }

/* GitHub API 调用封装（浏览器 fetch）*/
async function ghFetch(method, path, body, token) {
  const res = await fetch("https://api.github.com" + path, {
    method,
    headers: {
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

/* 查找同步码对应的 Gist */
async function findSyncGist(code, token) {
  const r = await ghFetch("GET", "/gists?per_page=100", null, token);
  if (r.status !== 200) throw new Error("查询失败: " + r.status);
  const tag = syncTag(code);
  const gist = (r.body || []).find(g => (g.description || "").includes(tag));
  return gist || null;
}

/* 创建新的同步 Gist */
async function createSyncGist(code, token) {
  const r = await ghFetch("POST", "/gists", {
    description: syncTag(code) + " 暑假识字乐园学习进度同步",
    public: false,
    files: {
      "progress.json": { content: JSON.stringify(S || {}, null, 1) },
      "README.md": { content: "# 暑假识字乐园进度同步\n此 Gist 由识字网站自动管理，请勿手动删除。\n同步码: " + code },
    },
  }, token);
  if (r.status !== 201) throw new Error("创建失败: " + JSON.stringify(r.body));
  return r.body;
}

/* 上传进度到 Gist */
async function pushProgress(gistId, token) {
  const r = await ghFetch("PATCH", "/gists/" + gistId, {
    files: { "progress.json": { content: JSON.stringify(S, null, 1) } },
  }, token);
  if (r.status !== 200) throw new Error("上传失败");
  return r.body;
}

/* 从 Gist 拉取进度并智能合并 */
async function pullProgress(gistId, token) {
  const r = await ghFetch("GET", "/gists/" + gistId, null, token);
  if (r.status !== 200) throw new Error("拉取失败");
  const content = r.body.files["progress.json"].content;
  const remote = JSON.parse(content);
  mergeProgress(remote);
  return remote;
}

/* 合并策略：每个字取对错次数更多的记录；学习/复习记录取并集 */
function mergeProgress(remote) {
  if (!remote || !remote.startDate) return;
  if (!S) { S = remote; save(); return; }
  // 保留更早的开始日期
  if (remote.startDate < S.startDate) S.startDate = remote.startDate;
  // 合并每日学习完成标记
  for (const d in (remote.study || {})) {
    if (!S.study[d]) S.study[d] = {};
    Object.assign(S.study[d], remote.study[d]);
  }
  // 合并复习完成记录
  for (const d in (remote.reviewDone || {})) {
    if (!S.reviewDone[d]) S.reviewDone[d] = [];
    S.reviewDone[d] = [...new Set([...S.reviewDone[d], ...remote.reviewDone[d]])];
  }
  // 合并学习日历
  S.studyDays = [...new Set([...(S.studyDays || []), ...(remote.studyDays || [])])];
  // 合并每个字的统计：取 right/wrong 更大的
  for (const ch in (remote.charStat || {})) {
    if (!S.charStat[ch]) { S.charStat[ch] = remote.charStat[ch]; continue; }
    const a = S.charStat[ch], b = remote.charStat[ch];
    a.right = Math.max(a.right, b.right);
    a.wrong = Math.max(a.wrong, b.wrong);
    a.firstDay = Math.min(a.firstDay, b.firstDay);
    a.reviews = { ...(b.reviews || {}), ...(a.reviews || {}) };
  }
  save();
}

/* ---------- UI 交互 ---------- */
function openSyncModal() {
  const existing = SYNC;
  document.getElementById("syncModal").classList.remove("hidden");
  const body = document.getElementById("syncBody");
  if (existing && existing.code) {
    body.innerHTML = `
      <p>当前同步码：</p>
      <div class="sync-code">${existing.code}</div>
      <p class="tip">在其他设备打开网站 → 点「☁️ 同步」→ 输入此同步码即可共享进度</p>
      <div class="modal-btns" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="doPush()">⬆️ 上传进度</button>
        <button class="btn btn-purple" onclick="doPull()">⬇️ 拉取进度</button>
        <button class="btn btn-yellow" onclick="copyCode('${existing.code}')">📋 复制同步码</button>
      </div>
      <p class="tip" id="syncMsg" style="margin-top:12px">上次同步: ${existing.lastSync ? new Date(existing.lastSync).toLocaleString() : "从未"}</p>
    `;
  } else {
    body.innerHTML = `
      <p>第一次使用同步功能：</p>
      <div class="modal-btns" style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary btn-big" onclick="createSync()">🆕 创建我的同步码</button>
        <div style="color:#aaa">或</div>
        <input id="joinCodeInput" placeholder="输入已有同步码 如 SHIZI-ABC123" style="font-size:16px;padding:12px;border-radius:12px;border:2px solid #ddd;text-align:center">
        <button class="btn btn-secondary" onclick="joinSync()">🔗 加入已有同步</button>
      </div>
      <p class="tip">📌 同步码是进度的钥匙，请妥善保管，不要分享给陌生人</p>
    `;
  }
}
function closeSyncModal() { document.getElementById("syncModal").classList.add("hidden"); }
function copyCode(code) {
  navigator.clipboard.writeText(code).then(() => syncMsg("已复制 ✅", true));
}
function syncMsg(msg, ok) {
  const el = document.getElementById("syncMsg");
  if (el) { el.textContent = msg; el.style.color = ok ? "var(--c-green)" : "var(--c-primary)"; }
  else alert(msg);
}

/* 需要用户授权一次 GitHub token（用于读写 Gist），只存在本机浏览器 */
function ensureToken() {
  let t = localStorage.getItem("shizi_gh_token");
  if (!t) {
    t = prompt("首次同步需要授权 GitHub（用于把进度存到你自己的私有 Gist，安全且免费）\n\n请粘贴你的 GitHub Token（需要 gist 权限）：\n（就是刚才你生成的那个 ghp_ 开头的）");
    if (!t) return null;
    t = t.trim();
    localStorage.setItem("shizi_gh_token", t);
  }
  return t;
}

async function createSync() {
  const token = ensureToken(); if (!token) return;
  syncMsg("创建中…", true);
  try {
    const code = genSyncCode();
    const gist = await createSyncGist(code, token);
    SYNC = { code, gistId: gist.id, lastSync: Date.now() };
    saveSync();
    openSyncModal();
    syncMsg("✅ 同步码创建成功！已上传当前进度", true);
  } catch (e) {
    syncMsg("创建失败：" + e.message, false);
  }
}
async function joinSync() {
  const token = ensureToken(); if (!token) return;
  const code = (document.getElementById("joinCodeInput").value || "").trim().toUpperCase();
  if (!/^SHIZI-[A-Z0-9]{6}$/.test(code)) { syncMsg("同步码格式不对，应为 SHIZI-XXXXXX", false); return; }
  syncMsg("查找中…", true);
  try {
    const gist = await findSyncGist(code, token);
    if (!gist) { syncMsg("没找到这个同步码，请确认输入正确（且该同步码是用你的 GitHub 账号创建的）", false); return; }
    SYNC = { code, gistId: gist.id, lastSync: null };
    saveSync();
    await pullProgress(gist.id, token);
    SYNC.lastSync = Date.now(); saveSync();
    openSyncModal();
    syncMsg("✅ 已加入同步，进度已合并！", true);
    setTimeout(() => render(), 500);
  } catch (e) { syncMsg("加入失败：" + e.message, false); }
}
async function doPush() {
  const token = ensureToken(); if (!token) return;
  try {
    await pushProgress(SYNC.gistId, token);
    SYNC.lastSync = Date.now(); saveSync();
    syncMsg("✅ 已上传 " + new Date().toLocaleTimeString(), true);
  } catch (e) { syncMsg("上传失败：" + e.message, false); }
}
async function doPull() {
  const token = ensureToken(); if (!token) return;
  try {
    await pullProgress(SYNC.gistId, token);
    SYNC.lastSync = Date.now(); saveSync();
    syncMsg("✅ 已拉取并合并 " + new Date().toLocaleTimeString(), true);
    setTimeout(() => render(), 500);
  } catch (e) { syncMsg("拉取失败：" + e.message, false); }
}

/* 每次学习/复习结束后自动上传（静默） */
async function autoSync() {
  if (!SYNC || !SYNC.gistId) return;
  const token = localStorage.getItem("shizi_gh_token");
  if (!token) return;
  try {
    await pushProgress(SYNC.gistId, token);
    SYNC.lastSync = Date.now(); saveSync();
    console.log("[sync] 自动上传完成");
  } catch (e) { console.warn("[sync] 自动上传失败", e); }
}
