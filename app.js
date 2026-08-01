/* ===== 三角洲识字特训营 核心逻辑 ===== */
"use strict";

/* ---------- 存储 ---------- */
const LS_KEY = "shizi_progress_v1";
let S = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.startDate) return s;
  } catch (e) {}
  return null;
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }

function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function diffDays(a, b) { // b - a 天数
  return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
}

/* ---------- 数据索引 ---------- */
const CHAR_MAP = {};
DATA.chars.forEach(x => CHAR_MAP[x.c] = x);
const DAY_CHARS = {}; // day -> [char]
DATA.plan.forEach(p => DAY_CHARS[p.day] = p.chars);

/* ---------- 首次设置 ---------- */
if (!S) {
  document.getElementById("setupModal").classList.remove("hidden");
  document.getElementById("startDateInput").value = todayStr();
}
function saveStartDate() {
  const v = document.getElementById("startDateInput").value || todayStr();
  S = {
    startDate: v,
    // study: { "1": {flash:true, quiz:true, pinyin:true, hunt:true}, ... }
    study: {},
    // charStat: { "蝌": {firstDay:1, seen:[], wrong:0, right:0, reviews:{1:'right',2:'wrong'} } }
    charStat: {},
    // reviewDone: { "2026-08-02": [1,2] }  某天完成了来自第几天的复习
    reviewDone: {},
    studyDays: []  // 有学习行为的日期
  };
  save();
  document.getElementById("setupModal").classList.add("hidden");
  render();
}

/* ---------- 计划计算 ---------- */
function currentDayNum() {
  const d = diffDays(S.startDate, todayStr()) + 1;
  return Math.max(1, Math.min(20, d));
}
// 今天应该复习哪些学习日的字（艾宾浩斯: 学后第1,2,4,7,15天）
function todayReviewSources(dateStr) {
  const elapsed = diffDays(S.startDate, dateStr); // 0=开始日
  const todayDay = elapsed + 1;
  const sources = [];
  for (let day = 1; day <= Math.min(todayDay - 1, 20); day++) {
    const learnedElapsed = day - 1; // 学习日距开始日
    const since = elapsed - learnedElapsed; // 距学习过去几天
    if (DATA.reviewIntervals.includes(since)) sources.push(day);
  }
  return sources;
}
function charStatInit(ch, day) {
  if (!S.charStat[ch]) S.charStat[ch] = { firstDay: day, wrong: 0, right: 0, reviews: {} };
  return S.charStat[ch];
}
function recordStudyDay() {
  const t = todayStr();
  if (!S.studyDays.includes(t)) { S.studyDays.push(t); }
}

/* ---------- 导航 ---------- */
const PAGES = ["home", "study", "review", "stats", "game"];
function go(p) {
  PAGES.forEach(x => {
    document.getElementById("page-" + x).classList.toggle("hidden", x !== p);
    const nb = document.getElementById("nav-" + x);
    if (nb) nb.classList.toggle("active", x === p);
  });
  if (p === "home") renderHome();
  if (p === "study") renderStudy();
  if (p === "review") renderReview();
  if (p === "stats") renderStats();
  window.scrollTo(0, 0);
}
function render() { go("home"); }

/* ---------- 发音 ---------- */
function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN"; u.rate = 0.7;
    speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- 首页 ---------- */
function renderHome() {
  const el = document.getElementById("page-home");
  const day = currentDayNum();
  const elapsed = diffDays(S.startDate, todayStr());
  const todayDone = S.studyDays.includes(todayStr());
  const reviewSources = todayReviewSources(todayStr());
  const reviewDoneToday = S.reviewDone[todayStr()] || [];
  const learnedCount = Object.keys(S.charStat).length;
  const totalRight = Object.values(S.charStat).reduce((a, b) => a + b.right, 0);
  const totalWrong = Object.values(S.charStat).reduce((a, b) => a + b.wrong, 0);
  const acc = totalRight + totalWrong > 0 ? Math.round(totalRight / (totalRight + totalWrong) * 100) : 100;

  el.innerHTML = `
    <div class="card hero">
      <h1>🪖 三角洲识字特训营</h1>
      <p>20 天攻克二年级上册 ${DATA.total} 个生字</p>
      <div class="day-badge">🪖 入营第 ${day} 天 ${elapsed >= 20 ? "（特训已完成）" : ""}</div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${Math.round(learnedCount / DATA.total * 100)}%">${learnedCount}/${DATA.total}</div></div>
      <div class="stat-chips">
        <span class="chip">🎖️ 已训 ${learnedCount} 字</span>
        <span class="chip">🎯 命中率 ${acc}%</span>
        <span class="chip">🔥 出勤 ${S.studyDays.length} 天</span>
      </div>
    </div>
    <div class="home-grid">
      <div class="home-tile tile-study" onclick="go('study')">
        <div class="icon">🎯</div>
        <h3>今日特训</h3>
        <p>第 ${day} 天 · 新训 ${(DAY_CHARS[day] || []).length} 个字 ${todayDone ? "✅ 已特训" : ""}</p>
      </div>
      <div class="home-tile tile-review" onclick="go('review')">
        <div class="icon">🔄</div>
        <h3>战术复习</h3>
        <p>${reviewSources.length > 0 ? `${reviewSources.length} 组字进入复习窗口！（已完成 ${reviewDoneToday.length}/${reviewSources.length}）` : "暂无到期复习，去新训吧"}</p>
      </div>
      <div class="home-tile tile-stats" onclick="go('stats')">
        <div class="icon">📋</div>
        <h3>作战报告</h3>
        <p>查看我的训练成果</p>
      </div>
    </div>
  `;
}

/* ---------- 学习页 ---------- */
const STUDY_MODES = [
  { id: "flash", icon: "🪪", name: "识别卡", desc: "逐一识别新字" },
  { id: "quiz", icon: "🔊", name: "听令选字", desc: "听读音，锁定汉字" },
  { id: "pinyin", icon: "🔤", name: "看字选读音", desc: "锁定正确读音" },
  { id: "hunt", icon: "🎯", name: "目标锁定", desc: "在字海里锁定目标" },
];
function renderStudy() {
  const el = document.getElementById("page-study");
  const day = currentDayNum();
  const chars = DAY_CHARS[day] || [];
  const st = S.study[day] || {};
  const doneCount = STUDY_MODES.filter(m => st[m.id]).length;

  el.innerHTML = `
    <div class="card">
      <h2 class="sec-title">🎯 第 ${day} 天 · 今日新训（${chars.length} 个）</h2>
      <p style="color:#888">完成下面 4 项训练，今天特训就达标啦！已达标 ${doneCount}/4</p>
      <div class="progress-wrap"><div class="progress-bar" style="width:${doneCount / 4 * 100}%"></div></div>
    </div>
    <div class="card">
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
        ${chars.map(c => `<span style="font-size:26px;font-weight:800;background:#f6f6fb;border-radius:10px;padding:6px 10px;cursor:pointer" onclick="speak('${c}')" title="${CHAR_MAP[c].p} · ${CHAR_MAP[c].l}">${c}</span>`).join("")}
      </div>
      <p style="text-align:center;color:#aaa;margin-top:8px;font-size:14px">点字可以听读音 🔊</p>
    </div>
    <div class="mode-grid">
      ${STUDY_MODES.map(m => `
        <div class="mode-card ${st[m.id] ? "done" : ""}" onclick="startGame('study','${m.id}')">
          <div class="icon">${m.icon}</div>
          <h4>${m.name}</h4>
          <p>${m.desc}</p>
          ${st[m.id] ? '<div class="done-badge">✅ 已达标</div>' : ""}
        </div>`).join("")}
    </div>
  `;
}

/* ---------- 复习页 ---------- */
function renderReview() {
  const el = document.getElementById("page-review");
  const t = todayStr();
  const sources = todayReviewSources(t);
  const done = S.reviewDone[t] || [];

  // 各来源中，错题优先
  let rows = sources.map(day => {
    const chars = DAY_CHARS[day] || [];
    const wrongs = chars.filter(c => (S.charStat[c] || {}).wrong > 0);
    return { day, total: chars.length, wrongs: wrongs.length, isDone: done.includes(day) };
  });

  el.innerHTML = `
    <div class="card">
      <h2 class="sec-title">🔄 今日战术复习</h2>
      <p style="color:#888">根据<b>艾宾浩斯记忆曲线</b>，学过的字要在第 1、2、4、7、15 天巩固，才能牢牢记住！</p>
      <div class="legend">
        <span>🟣 到期复习</span><span>🔴 含未掌握（优先练）</span><span>✅ 已完成</span>
      </div>
      ${rows.length === 0 ? `<div class="empty-state"><div class="icon">🎖️</div><p>今天没有到期的复习内容！<br>去新训，或者加练一下未掌握的字吧～</p></div>` : ""}
      ${rows.map(r => `
        <div class="review-day-row ${r.isDone ? "done" : ""}">
          <div class="info">
            第 ${r.day} 天新训的 ${r.total} 个字
            <span class="tag">待巩固</span>
            ${r.wrongs > 0 ? `<span class="tag wrong-tag">含 ${r.wrongs} 个未掌握</span>` : ""}
          </div>
          ${r.isDone ? "<span style='font-size:22px'>✅</span>" : `<button class="btn btn-secondary" onclick="startReview(${r.day})">开始巩固 ▶</button>`}
        </div>`).join("")}
    </div>
    ${weakChars().length > 0 ? `
    <div class="card">
      <h2 class="sec-title">💪 未掌握专项加练</h2>
      <p style="color:#888">这些字之前没锁定，随时可以来加练！</p>
      <div style="text-align:center;margin-top:12px">
        <button class="btn btn-primary btn-big" onclick="startWeakTraining()">开始加练（${weakChars().length} 字）💪</button>
      </div>
    </div>` : ""}
    <div class="card">
      <h2 class="sec-title">🗓️ 未来巩固安排</h2>
      ${futureSchedule()}
    </div>
  `;
}
function futureSchedule() {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    const d = addDays(todayStr(), i);
    const src = todayReviewSources(d);
    if (src.length > 0) html += `<div class="review-day-row"><div class="info">${d}：复习第 ${src.join("、")} 天的字</div></div>`;
  }
  return html || `<p style="color:#aaa">未来 5 天暂无到期复习</p>`;
}
function weakChars() {
  return Object.entries(S.charStat).filter(([c, st]) => st.wrong > 0)
    .sort((a, b) => b[1].wrong - a[1].wrong).map(([c]) => c);
}

/* ---------- 游戏引擎 ---------- */
let G = null; // 当前游戏状态

function shuffle(a) {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}
function sample(pool, n, exclude) {
  return shuffle(pool.filter(x => x !== exclude)).slice(0, n);
}

function startGame(kind, mode, customChars, onDone) {
  // kind: study | review | weak
  const day = currentDayNum();
  let chars;
  if (kind === "study") chars = DAY_CHARS[day];
  else chars = customChars;

  if (!chars || chars.length === 0) { alert("没有可练习的字哦"); return; }
  recordStudyDay(); save();

  G = { kind, mode, chars: shuffle(chars), day, idx: 0, right: 0, wrong: 0, onDone };
  PAGES.forEach(x => document.getElementById("page-" + x).classList.toggle("hidden", x !== "game"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  window.scrollTo(0, 0);
  nextRound();
}

function nextRound() {
  if (G.idx >= G.chars.length) return finishGame();
  const ch = G.chars[G.idx];
  const area = document.getElementById("gameArea");
  const head = `
    <div class="game-head">
      <button class="btn btn-yellow" onclick="quitGame()">← 返回</button>
      <span class="streak">🎯 ${G.right} 命中 / ${G.wrong} 失误</span>
      <span style="font-weight:800">${G.idx + 1} / ${G.chars.length}</span>
    </div>`;
  if (G.mode === "flash") area.innerHTML = head + flashHTML(ch);
  else if (G.mode === "quiz") area.innerHTML = head + quizHTML(ch);
  else if (G.mode === "pinyin") area.innerHTML = head + pinyinHTML(ch);
  else if (G.mode === "hunt") area.innerHTML = head + huntHTML(ch);
}

/* --- 模式1：识字卡片 --- */
function flashHTML(ch) {
  const info = CHAR_MAP[ch];
  return `
  <div class="card flash-stage">
    <div class="flash-char" onclick="speak('${ch}')">
      <div class="flash-pinyin">${info.p}</div>
      <div>${ch}</div>
      <div class="flash-meta">${info.u} · ${info.l} · 点我听读音 🔊</div>
    </div>
    <p style="color:#888">认识这个字吗？点字卡听读音，然后如实汇报～</p>
    <div class="know-btns">
      <button class="btn btn-green btn-big" onclick="flashAnswer(true)">😎 已掌握</button>
      <button class="btn btn-primary btn-big" onclick="flashAnswer(false)">🤔 待加强</button>
    </div>
  </div>`;
}
function flashAnswer(know) {
  markResult(G.chars[G.idx], know, G.kind);
  if (know) { G.right++; } else { G.wrong++; speak(G.chars[G.idx]); }
  G.idx++; setTimeout(nextRound, know ? 150 : 700);
}

/* --- 模式2：听音选字 --- */
function quizHTML(ch) {
  const opts = [ch, ...sample(G.kind === "study" ? G.chars : DATA.chars.map(x => x.c), 3, ch)];
  const shuffled = shuffle(opts);
  setTimeout(() => speak(ch), 300);
  return `
  <div class="card">
    <div class="game-q">🔊 听指令，锁定你听到的字
      <button class="btn btn-secondary" onclick="speak('${ch}')">再听一遍 🔂</button>
    </div>
    <div class="options-grid">
      ${shuffled.map(o => `<button class="opt-btn" onclick="answer(this,'${o}','${ch}')">${o}</button>`).join("")}
    </div>
    <div class="feedback" id="fb"></div>
  </div>`;
}

/* --- 模式3：看字选拼音 --- */
function pinyinHTML(ch) {
  const info = CHAR_MAP[ch];
  const others = sample(DATA.chars.map(x => x.c), 3, ch).map(c => CHAR_MAP[c].p);
  const opts = shuffle([info.p, ...others]);
  return `
  <div class="card">
    <div class="game-q">这个字怎么读？<span class="big">${ch}</span></div>
    <div class="options-grid">
      ${opts.map(o => `<button class="opt-btn pinyin-opt" onclick="answer(this,'${o}','${info.p}')">${o}</button>`).join("")}
    </div>
    <div class="feedback" id="fb"></div>
  </div>`;
}

/* --- 模式4：火眼金睛找字 --- */
function huntHTML(ch) {
  const distractors = sample(DATA.chars.map(x => x.c), 11, ch);
  const cells = shuffle([ch, ...distractors]);
  return `
  <div class="card">
    <div class="game-q">🎯 锁定这个字：<span style="color:var(--c-primary);font-size:44px">${ch}</span>
      <button class="btn btn-secondary" onclick="speak('${ch}')">🔊</button>
    </div>
    <div class="hunt-grid">
      ${cells.map(o => `<div class="hunt-cell" onclick="huntAnswer(this,'${o}','${ch}')">${o}</div>`).join("")}
    </div>
    <div class="feedback" id="fb"></div>
  </div>`;
}
let huntLock = false;
function huntAnswer(el, pick, right) {
  if (huntLock) return;
  if (pick === right) {
    huntLock = true;
    el.classList.add("hit");
    markResult(right, true, G.kind); G.right++;
    fb("锁定目标！🎯", true);
    setTimeout(() => { huntLock = false; G.idx++; nextRound(); }, 700);
  } else {
    el.classList.add("miss");
    markResult(right, false, G.kind); G.wrong++;
    fb("目标不对，再锁定～", false);
    setTimeout(() => el.classList.remove("miss"), 400);
  }
}

/* --- 通用答题 --- */
let ansLock = false;
function answer(el, pick, right) {
  if (ansLock) return;
  ansLock = true;
  const ok = pick === right;
  if (ok) {
    el.classList.add("correct");
    markResult(right, true, G.kind); G.right++;
    fb("命中！🎯", true);
  } else {
    el.classList.add("wrong");
    document.querySelectorAll(".opt-btn").forEach(b => {
      if (b.textContent === right) b.classList.add("correct");
    });
    markResult(right, false, G.kind); G.wrong++;
    fb(`正确答案是「${right}」`, false);
    speak(right);
  }
  setTimeout(() => { ansLock = false; G.idx++; nextRound(); }, ok ? 700 : 1400);
}
function fb(msg, good) {
  const f = document.getElementById("fb");
  if (f) { f.textContent = msg; f.className = "feedback " + (good ? "good" : "bad"); }
}

/* --- 记录对错（学习/复习都进统计） --- */
function markResult(ch, right, kind) {
  const day = G ? G.day : currentDayNum();
  const st = charStatInit(ch, day);
  if (right) st.right++; else st.wrong++;
  if (kind === "review" || kind === "weak") {
    const elapsed = diffDays(S.startDate, todayStr());
    st.reviews[elapsed] = right ? "right" : "wrong";
  }
  save();
}

/* --- 复习入口 --- */
function startReview(fromDay) {
  // 错题排前面，其余随后 —— 时间曲线到期的字全部提上来
  const chars = DAY_CHARS[fromDay] || [];
  const wrongs = chars.filter(c => (S.charStat[c] || {}).wrong > 0);
  const others = chars.filter(c => !wrongs.includes(c));
  const ordered = [...shuffle(wrongs), ...shuffle(others)];
  // 随机选一种练习方式
  const modes = ["quiz", "pinyin", "hunt"];
  const mode = modes[Math.floor(Math.random() * modes.length)];
  startGame("review", mode, ordered, () => {
    const t = todayStr();
    if (!S.reviewDone[t]) S.reviewDone[t] = [];
    if (!S.reviewDone[t].includes(fromDay)) S.reviewDone[t].push(fromDay);
    save();
  });
}
function startWeakTraining() {
  const wc = weakChars().slice(0, 20);
  const modes = ["quiz", "pinyin", "hunt"];
  const mode = modes[Math.floor(Math.random() * modes.length)];
  startGame("weak", mode, wc, () => {});
}

/* --- 结束 --- */
function finishGame() {
  const total = G.right + G.wrong;
  const acc = total > 0 ? Math.round(G.right / total * 100) : 0;
  if (G.kind === "study") {
    if (!S.study[G.day]) S.study[G.day] = {};
    S.study[G.day][G.mode] = true;
  }
  if (G.onDone) G.onDone();
  recordStudyDay(); save();

  let emoji, msg;
  if (acc === 100) { emoji = "🏆🌟🎖️"; msg = "全员命中！你是王牌干员！"; }
  else if (acc >= 80) { emoji = "🎖️👏⭐"; msg = "表现优秀！继续保持！"; }
  else if (acc >= 60) { emoji = "💪🎯"; msg = "不错！未掌握的字已加入巩固计划～"; }
  else { emoji = "🌱💪"; msg = "别急！未掌握的字会反复出现帮你记住它！"; }

  document.getElementById("celebrateContent").innerHTML = `
    <div class="emoji-rain">${emoji}</div>
    <h2>${msg}</h2>
    <p>本轮 ${total} 题 · 命中 ${G.right} · 命中率 ${acc}%</p>
  `;
  document.getElementById("celebrateModal").classList.remove("hidden");
  if (typeof autoSync === "function") autoSync(); // 静默上传云端
}
function closeCelebrate() {
  document.getElementById("celebrateModal").classList.add("hidden");
  go(G.kind === "study" ? "study" : "review");
}
function quitGame() { go(G.kind === "study" ? "study" : "review"); }

/* ---------- 报告页 ---------- */
function renderStats() {
  const el = document.getElementById("page-stats");
  const learned = Object.keys(S.charStat).length;
  const totalRight = Object.values(S.charStat).reduce((a, b) => a + b.right, 0);
  const totalWrong = Object.values(S.charStat).reduce((a, b) => a + b.wrong, 0);
  const acc = totalRight + totalWrong > 0 ? Math.round(totalRight / (totalRight + totalWrong) * 100) : 100;
  const mastered = Object.values(S.charStat).filter(s => s.right >= 2 && s.wrong === 0).length;
  const weak = weakChars().slice(0, 20);

  // 学习日历（开始日起20天）
  let cal = "";
  for (let i = 0; i < 20; i++) {
    const d = addDays(S.startDate, i);
    const studied = S.studyDays.includes(d);
    const isToday = d === todayStr();
    cal += `<div class="cal-day ${studied ? "studied" : ""} ${isToday ? "today" : ""}">${i + 1}${studied ? "⭐" : ""}</div>`;
  }

  el.innerHTML = `
    <div class="card">
      <h2 class="sec-title">📋 我的作战报告</h2>
      <div class="stats-grid">
        <div class="stat-box"><div class="num" style="color:var(--c-primary)">${learned}</div><div class="label">已训生字</div></div>
        <div class="stat-box"><div class="num" style="color:var(--c-green)">${mastered}</div><div class="label">稳定掌握</div></div>
        <div class="stat-box"><div class="num" style="color:var(--c-blue)">${acc}%</div><div class="label">命中率</div></div>
        <div class="stat-box"><div class="num" style="color:var(--c-purple)">${S.studyDays.length}</div><div class="label">出勤天数</div></div>
        <div class="stat-box"><div class="num" style="color:#F59E0B">${weak.length}</div><div class="label">待巩固字</div></div>
      </div>
    </div>
    <div class="card">
      <h2 class="sec-title">🗓️ 20 天特训日历</h2>
      <div class="calendar">${cal}</div>
      <p style="color:#aaa;font-size:14px;margin-top:8px">⭐ = 当天有训练</p>
    </div>
    ${weak.length > 0 ? `
    <div class="card">
      <h2 class="sec-title">😅 容易失误的字（点多加练）</h2>
      <div class="weak-chars">
        ${weak.map(c => `<div class="weak-char" onclick="speak('${c}')" title="${CHAR_MAP[c].p}">${c}</div>`).join("")}
      </div>
    </div>` : `
    <div class="card empty-state"><div class="icon">🏆</div><p>太强了！目前零失误！</p></div>`}
  `;
}

/* ---------- 启动 ---------- */
if (S) render();
