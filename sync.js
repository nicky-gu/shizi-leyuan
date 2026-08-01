/* ===== 跨终端同步（Cloudflare Workers KV 存储）=====
   同步码即凭证，无需任何 token。
   浏览器 ←→ Worker API ←→ Cloudflare KV
   同步码(用户自定义,如 XIAOMING-2019) → KV key: progress:XIAOMING-2019 */
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
        <p style="font-weight:700">🆕 第一次用？自己起一个好记的同步码：</p>
        <input id="createCodeInput" placeholder="如 XIAOMING-2019 或 MEIMEI-01" maxlength="20"
          style="font-size:16px;padding:12px;border-radius:12px;border:2px solid #ddd;text-align:center;text-transform:uppercase">
        <button class="btn btn-primary btn-big" onclick="createSync()">✅ 用这个同步码创建</button>
        <div style="color:#aaa;margin:4px 0">———— 其他设备已有进度？————</div>
        <input id="joinCodeInput" placeholder="输入已有的同步码" maxlength="20"
          style="font-size:16px;padding:12px;border-radius:12px;border:2px solid #ddd;text-align:center;text-transform:uppercase">
        <button class="btn btn-secondary" onclick="joinSync()">🔗 加入已有同步</button>
      </div>
      <p class="tip">📌 同步码规则：4-20位，字母/数字/中划线，建议用「名字拼音+数字」好记<br>它是进度的钥匙，告诉孩子或拍照记下</p>
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
    stopAutoSync(); updateSyncBadge();
    closeSyncModal();
  }
}

/* 同步码统一校验：4-20位字母/数字/中划线 */
function validCode(code) { return /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/.test(code); }

async function createSync() {
  const code = (document.getElementById("createCodeInput").value || "").trim().toUpperCase();
  if (!validCode(code)) {
    alert("同步码格式不对！\n\n要求：4-20位，只能用 字母/数字/中划线\n示例：XIAOMING-2019、MEIMEI-01");
    return;
  }
  syncMsgCreate("检查中…");
  try {
    // 先检查是否已被别人占用
    const check = await apiGet(code);
    if (check.status === 200) {
      alert(`同步码「${code}」已被使用了！\n\n如果这是你之前创建的，请用下方「加入已有同步」；\n如果不是，请换一个（比如后面加个数字）。`);
      syncMsgCreate("✅ 用这个同步码创建");
      return;
    }
    syncMsgCreate("创建中…");
    const r = await apiSave(code, S || {});
    if (r.status !== 200) throw new Error(r.body.error || ("HTTP " + r.status));
    SYNC = { code, lastSync: Date.now() };
    saveSync();
    startAutoSync(); updateSyncBadge();
    openSyncModal();
    syncMsg("✅ 同步码创建成功！别的设备输入它即可同步（已开启自动同步）", true);
  } catch (e) {
    alert("创建失败：" + e.message);
    syncMsgCreate("✅ 用这个同步码创建");
  }
}
function syncMsgCreate(m) {
  const btn = document.querySelector("#syncBody .btn-primary");
  if (btn) btn.textContent = m;
}

async function joinSync() {
  const code = (document.getElementById("joinCodeInput").value || "").trim().toUpperCase();
  if (!validCode(code)) { alert("同步码格式不对！\n\n4-20位，只能用 字母/数字/中划线"); return; }
  try {
    const r = await apiGet(code);
    if (r.status === 404) { alert("没找到这个同步码，请检查是否输入正确"); return; }
    if (r.status !== 200) throw new Error(r.body.error || ("HTTP " + r.status));
    mergeProgress(r.body);
    SYNC = { code, lastSync: Date.now() };
    saveSync();
    startAutoSync(); updateSyncBadge();
    openSyncModal();
    syncMsg("✅ 已加入同步，进度已合并！（已开启自动同步）", true);
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

/* ===== 自动同步引擎 ===== */
let _pushTimer = null;
let _syncing = false;

/* 防抖上传：练习结束后3秒再传，连续操作会合并成一次 */
function autoSync() {
  if (!SYNC || !SYNC.code) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => doAutoPush(), 3000);
}
async function doAutoPush() {
  if (!SYNC || !SYNC.code || _syncing) return;
  _syncing = true;
  try {
    await apiSave(SYNC.code, S || {});
    SYNC.lastSync = Date.now(); saveSync();
    updateSyncBadge();
    console.log("[sync] 自动上传完成", new Date().toLocaleTimeString());
  } catch (e) { console.warn("[sync] 自动上传失败", e); }
  _syncing = false;
}

/* 静默拉取并合并（打开网站/定时用） */
async function silentPull() {
  if (!SYNC || !SYNC.code || _syncing) return;
  _syncing = true;
  try {
    const r = await apiGet(SYNC.code);
    if (r.status === 200) {
      const before = JSON.stringify(S);
      mergeProgress(r.body);
      // 只有远程有新内容才刷新界面
      if (JSON.stringify(S) !== before) {
        console.log("[sync] 拉取到新进度，已合并");
        if (typeof render === "function") render();
      }
      SYNC.lastSync = Date.now(); saveSync();
      updateSyncBadge();
    }
  } catch (e) { console.warn("[sync] 自动拉取失败", e); }
  _syncing = false;
}

/* 完整双向同步：先拉取合并，再上传 */
async function fullSync() {
  await silentPull();
  await doAutoPush();
}

/* 定时自动同步：每5分钟一次（页面在前台时） */
let _autoTimer = null;
function startAutoSync() {
  if (!SYNC || !SYNC.code) return;
  stopAutoSync();
  _autoTimer = setInterval(() => {
    if (document.visibilityState === "visible") fullSync();
  }, 5 * 60 * 1000);
  console.log("[sync] 自动同步已启动（每5分钟）");
}
function stopAutoSync() { if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; } }

/* 回到前台时立即同步一次 */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && SYNC && SYNC.code) silentPull();
});

/* 导航栏同步按钮上显示状态点 */
function updateSyncBadge() {
  const btn = document.getElementById("nav-sync");
  if (!btn) return;
  btn.innerHTML = SYNC && SYNC.code
    ? `☁️ 同步 <span style="color:var(--c-green);font-size:12px">●</span>`
    : "☁️ 同步";
}

/* 页面加载时：有同步码则立即拉取一次 + 启动定时同步 */
window.addEventListener("load", () => {
  updateSyncBadge();
  if (SYNC && SYNC.code) {
    silentPull();
    startAutoSync();
  }
});

