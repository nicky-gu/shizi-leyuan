/* ===== 跨终端同步（Cloudflare Workers KV 存储）=====
   同步码即凭证，无需任何 token。
   浏览器 ←→ Worker API ←→ Cloudflare KV
   同步码: SHIZI-XXXXXX → KV key: progress:SHIZI-XXXXXX */
"use strict";

/* 同步 API 与网站同源（Pages Functions），用相对路径即可 */
const SYNC_API = "";

const SYNC_LS_KEY = "shizi_sync_v1";
let SYNC = loadSync();

function loadSync() {
  try { return JSON.parse(localStorage.getItem(SYNC_LS_KEY)) || null; }
  catch (e) { return null; }
}
function saveSync() { localStorage.setItem(SYNC_LS_KEY, JSON.stringify(SYNC)); }

function genSyncCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 去掉易混淆 0/O 1/I
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return "SHIZI-" + code;
}

/* ---------- API 调用 ---------- */
async function apiGet(code) {
  const res = await fetch(`${SYNC_API}/sync/${encodeURIComponent(code)}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}
async function apiSave(code, data) {
  const res = await fetch(`${SYNC_API}/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, data }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/* ---------- 合并策略：每字取对错次数多的，记录取并集 ---------- */
function mergeProgress(remote) {
  if (!remote || !remote.startDate) return;
  if (!S) { S = remote; save(); return; }
  if (remote.startDate < S.startDate) S.startDate = remote.startDate;
  for (const d in (remote.study || {})) {
    if (!S.study[d]) S.study[d] = {};
    Object.assign(S.study[d], remote.study[d]);
  }
  for (const d in (remote.reviewDone || {})) {
    if (!S.reviewDone[d]) S.reviewDone[d] = [];
    S.reviewDone[d] = [...new Set([...S.reviewDone[d], ...remote.reviewDone[d]])];
  }
  S.studyDays = [...new Set([...(S.studyDays || []), ...(remote.studyDays || [])])];
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

/* ---------- UI ---------- */
function openSyncModal() {
  document.getElementById("syncModal").classList.remove("hidden");
  const body = document.getElementById("syncBody");
  if (SYNC && SYNC.code) {
    body.innerHTML = `
      <p>当前同步码（在其他设备输入它即可共享进度）：</p>
      <div class="sync-code">${SYNC.code}</div>
      <div class="modal-btns" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-secondary" onclick="doPush()">⬆️ 上传进度</button>
        <button class="btn btn-purple" onclick="doPull()">⬇️ 拉取进度</button>
        <button class="btn btn-yellow" onclick="copyCode('${SYNC.code}')">📋 复制</button>
      </div>
      <p class="tip" id="syncMsg" style="margin-top:12px">上次同步: ${SYNC.lastSync ? new Date(SYNC.lastSync).toLocaleString() : "从未"}</p>
      <p style="margin-top:10px"><a href="javascript:unlinkSync()" style="color:#bbb;font-size:12px">🔌 断开本机与同步码的关联</a></p>
    `;
  } else {
    body.innerHTML = `
      <p>第一次使用同步：</p>
      <div class="modal-btns" style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-primary btn-big" onclick="createSync()">🆕 生成我的同步码</button>
        <div style="color:#aaa">或</div>
        <input id="joinCodeInput" placeholder="输入已有同步码 如 SHIZI-K7M2QX" maxlength="12"
          style="font-size:16px;padding:12px;border-radius:12px;border:2px solid #ddd;text-align:center;text-transform:uppercase">
        <button class="btn btn-secondary" onclick="joinSync()">🔗 加入已有同步</button>
      </div>
      <p class="tip">📌 同步码就是进度的钥匙，记好它（或拍照），别的设备输入即可同步</p>
    `;
  }
}
function closeSyncModal() { document.getElementById("syncModal").classList.add("hidden"); }
function copyCode(code) { navigator.clipboard.writeText(code).then(() => syncMsg("已复制 ✅", true)); }
function syncMsg(msg, ok) {
  const el = document.getElementById("syncMsg");
  if (el) { el.textContent = msg; el.style.color = ok ? "var(--c-green)" : "var(--c-primary)"; }
}
function unlinkSync() {
  if (confirm("断开本机与同步码的关联？\n（云端进度保留，本机进度也保留，只是不再自动同步）")) {
    SYNC = null;
    localStorage.removeItem(SYNC_LS_KEY);
    closeSyncModal();
  }
}

async function createSync() {
  syncMsgCreate("生成中…");
  try {
    const code = genSyncCode();
    const r = await apiSave(code, S || {});
    if (r.status !== 200) throw new Error(r.body.error || ("HTTP " + r.status));
    SYNC = { code, lastSync: Date.now() };
    saveSync();
    openSyncModal();
    syncMsg("✅ 同步码已生成并上传当前进度！", true);
  } catch (e) {
    alert("创建失败：" + e.message + "\n\n请检查 sync.js 顶部的 SYNC_API 地址是否已改成你的 Worker 地址");
  }
}
function syncMsgCreate(m) {
  const btn = document.querySelector("#syncBody .btn-primary");
  if (btn) btn.textContent = m;
}

async function joinSync() {
  const code = (document.getElementById("joinCodeInput").value || "").trim().toUpperCase();
  if (!/^SHIZI-[A-Z0-9]{6}$/.test(code)) { alert("同步码格式不对，应为 SHIZI-XXXXXX"); return; }
  try {
    const r = await apiGet(code);
    if (r.status === 404) { alert("没找到这个同步码，请检查是否输入正确"); return; }
    if (r.status !== 200) throw new Error(r.body.error || ("HTTP " + r.status));
    mergeProgress(r.body);
    SYNC = { code, lastSync: Date.now() };
    saveSync();
    openSyncModal();
    syncMsg("✅ 已加入同步，进度已合并！", true);
    setTimeout(() => render(), 600);
  } catch (e) { alert("加入失败：" + e.message); }
}

async function doPush() {
  try {
    const r = await apiSave(SYNC.code, S || {});
    if (r.status !== 200) throw new Error(r.body.error || ("HTTP " + r.status));
    SYNC.lastSync = Date.now(); saveSync();
    syncMsg("✅ 已上传 " + new Date().toLocaleTimeString(), true);
  } catch (e) { syncMsg("上传失败：" + e.message, false); }
}
async function doPull() {
  try {
    const r = await apiGet(SYNC.code);
    if (r.status !== 200) throw new Error(r.body.error || ("HTTP " + r.status));
    mergeProgress(r.body);
    SYNC.lastSync = Date.now(); saveSync();
    syncMsg("✅ 已拉取并合并 " + new Date().toLocaleTimeString(), true);
    setTimeout(() => render(), 600);
  } catch (e) { syncMsg("拉取失败：" + e.message, false); }
}

/* 每次练习结束自动上传（静默） */
async function autoSync() {
  if (!SYNC || !SYNC.code) return;
  try {
    await apiSave(SYNC.code, S || {});
    SYNC.lastSync = Date.now(); saveSync();
    console.log("[sync] 自动上传完成");
  } catch (e) { console.warn("[sync] 自动上传失败", e); }
}
