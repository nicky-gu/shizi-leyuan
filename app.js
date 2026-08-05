/* ===== 三角洲识字特训营 核心逻辑 ===== */
"use strict";

/* ---------- 数据索引（必须在 loadState 之前初始化，因为 loadState 引用 CHAR_MAP） ---------- */
const CHAR_MAP = {};
DATA.chars.forEach(x => CHAR_MAP[x.c] = x);
const ALL_CHARS = DATA.chars.map(x => x.c);  // 预建全字数组，避免重复创建
const ALL_PINYIN = [...new Set(DATA.chars.map(x => x.p))];  // 去重后的全拼音列表
const DAY_CHARS = {}; // day -> [char]
DATA.plan.forEach(p => DAY_CHARS[p.day] = p.chars);

/* ---------- 存储 ---------- */
const LS_KEY = "shizi_progress_v1";
let S = loadState();

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.startDate) {
      // 一次性清理旧 bug 误存进 S.charStat 的非汉字 key(如拼音串)
      // 历史 bug: pinyinHTML 把 info.p 当作 right 传给 answer(), 导致 S.charStat["guà"] 等被写入
      if (s.charStat) {
        Object.keys(s.charStat).forEach(k => {
          if (!CHAR_MAP[k]) delete s.charStat[k];
        });
      }
      return s;
    }
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
    // reviewCompleted: { "1": [1,2], "3": [0] }  某学习日已完成哪些复习间隔(0=当日即时巩固)
    reviewCompleted: {},
    studyDays: []  // 有学习行为的日期
  };
  save();
  document.getElementById("setupModal").classList.add("hidden");
  render();
}

/* ---------- 旧数据迁移：reviewDone → reviewCompleted ---------- */
if (S && S.reviewDone && !S.reviewCompleted) {
  S.reviewCompleted = reviewDoneToCompleted(S.reviewDone);
  delete S.reviewDone;
  save();
}

/* ---------- 计划计算 ---------- */
function currentDayNum() {
  const d = diffDays(S.startDate, todayStr()) + 1;
  return Math.max(1, Math.min(20, d));
}
// 某学习日已完成过的复习间隔集合（0 = 当日即时巩固）
function completedSet(fromDay) {
  return new Set((S.reviewCompleted && S.reviewCompleted[fromDay]) || []);
}
// 旧版 reviewDone {日期:[fromDay]} → 新版 reviewCompleted {fromDay:[间隔]}
function reviewDoneToCompleted(rd) {
  const out = {};
  for (const date in (rd || {})) {
    const e = diffDays(S.startDate, date); // 该日期距开营的天数(=elapsed)
    (rd[date] || []).forEach(fromDay => {
      const iv = e - (fromDay - 1); // 当时距该学习日已过去几天 = 完成的间隔序号
      if (iv >= 1) (out[fromDay] = out[fromDay] || []).push(iv);
    });
  }
  return out;
}
// 今天（或某天）应该复习哪些学习日的字（艾宾浩斯: 学后第1,2,4,7,15天）
// 返回 [{day, intervals:[待巩固的间隔序号], today:bool}]
// 关键：漏掉的复习会一直"待巩固"直到真正做完（遗留补练），不会过期消失
function todayReviewSources(dateStr) {
  const elapsed = diffDays(S.startDate, dateStr); // 0=开始日
  const curDay = elapsed + 1;
  const isToday = dateStr === todayStr();
  const out = [];
  for (let day = 1; day <= 20; day++) {
    const chars = DAY_CHARS[day];
    if (!chars || !chars.length) continue;
    const learnedElapsed = day - 1; // 学习日距开始日
    const since = elapsed - learnedElapsed; // 距学习过去几天
    const done = completedSet(day);
    // 今日新训：允许当天即时巩固一次（特殊间隔 0）
    if (isToday && day === curDay) {
      if (!done.has(0)) out.push({ day, intervals: [0], today: true });
      continue;
    }
    if (since < 1) continue; // 还没学满一天
    // 已到窗口、但还没完成的间隔 = 待巩固（含之前漏掉的，即"遗留"）
    const pending = DATA.reviewIntervals.filter(iv => iv <= since && !done.has(iv));
    if (pending.length) out.push({ day, intervals: pending, today: false });
  }
  return out;
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
// 优先播放预生成的高质量音频（跨端一致、拼音/声调准确）；缺失或失败再回退浏览器 TTS
// escapeApos: 防御性地转义单引号，防止数据中的特殊字符破坏 onclick 内联事件
function escapeApos(s) { return String(s).replace(/'/g, "\\'"); }
function speak(text) {
  if (text && text.length === 1) {
    const fn = "assets/audio/u" + text.codePointAt(0).toString(16) + ".mp3";
    const a = new Audio(fn);
    let fell = false;
    const fb = () => { if (!fell) { fell = true; fallbackSpeak(text); } };
    a.onerror = fb;
    a.play().catch(fb);
    return;
  }
  fallbackSpeak(text);
}
function fallbackSpeak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN"; u.rate = 0.8;
    speechSynthesis.speak(u);
  } catch (e) {}
}

/* ---------- 首页 ---------- */
function renderHome() {
  const el = document.getElementById("page-home");
  const day = currentDayNum();
  const elapsed = diffDays(S.startDate, todayStr());
  const todayDone = S.studyDays.includes(todayStr());
  const reviewItems = todayReviewSources(todayStr());
  const learnedCount = Object.keys(S.charStat).length;
  const totalRight = Object.values(S.charStat).reduce((a, b) => a + b.right, 0);
  const totalWrong = Object.values(S.charStat).reduce((a, b) => a + b.wrong, 0);
  const acc = totalRight + totalWrong > 0 ? Math.round(totalRight / (totalRight + totalWrong) * 100) : 100;

  el.innerHTML = `
    <div class="card hero">
      <div class="mascot">${mascotSVG("idle")}</div>
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
        <p>${reviewItems.length > 0 ? `${reviewItems.length} 组字待巩固（含遗漏补练）！去复盘吧 ▶` : "暂无到期复习，去新训吧"}</p>
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
  { id: "hunt", icon: "🔗", name: "连连看", desc: "字与拼音配对连连看" },
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
        ${chars.map(c => `<span style="font-size:26px;font-weight:800;background:#f6f6fb;border-radius:10px;padding:6px 10px;cursor:pointer" onclick="speak('${escapeApos(c)}')" title="${CHAR_MAP[c].p} · ${CHAR_MAP[c].l}">${c}</span>`).join("")}
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
  const items = todayReviewSources(t);

  // 各来源中，错题优先
  let rows = items.map(it => {
    const chars = DAY_CHARS[it.day] || [];
    const wrongs = chars.filter(c => (S.charStat[c] || {}).wrong > 0);
    return { day: it.day, intervals: it.intervals, today: it.today, total: chars.length, wrongs: wrongs.length };
  });

  el.innerHTML = `
    <div class="card">
      <h2 class="sec-title">🔄 今日战术复习</h2>
      <p style="color:#888">根据<b>艾宾浩斯记忆曲线</b>，学过的字要在第 1、2、4、7、15 天巩固；<b>之前漏掉的会一直留在这里</b>，直到真正巩固完为止。</p>
      <div class="legend">
        <span>🟣 待巩固</span><span>🔴 含未掌握（优先练）</span><span>🔆 今日即时巩固</span>
      </div>
      ${rows.length === 0 ? `<div class="empty-state"><div class="icon">🎖️</div><p>今天没有待巩固的内容！<br>去新训，或者加练一下未掌握的字吧～</p></div>` : ""}
      ${rows.map(r => `
        <div class="review-day-row">
          <div class="info">
            第 ${r.day} 天新训的 ${r.total} 个字
            ${r.today
              ? `<span class="tag">今日即时巩固</span>`
              : `<span class="tag">待巩固（第 ${r.intervals.join("、")} 次）</span>`}
            ${r.wrongs > 0 ? `<span class="tag wrong-tag">含 ${r.wrongs} 个未掌握</span>` : ""}
          </div>
          <button class="btn btn-secondary" onclick="startReview(${r.day})">开始巩固 ▶</button>
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
    if (src.length > 0) html += `<div class="review-day-row"><div class="info">${d}：复习第 ${src.map(x => x.day).join("、")} 天的字</div></div>`;
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
  // 先清空，确保上一题的 correct/wrong/动画状态不会残留到下一题
  area.innerHTML = "";
  const head = `
    <div class="game-head">
      <button class="btn btn-yellow" onclick="quitGame()">← 返回</button>
      <span class="streak">🎯 ${G.right} 命中 / ${G.wrong} 失误</span>
      <span style="font-weight:800">${G.idx + 1} / ${G.chars.length}</span>
    </div>`;
  if (G.mode === "flash") area.innerHTML = head + flashHTML(ch);
  else if (G.mode === "quiz") area.innerHTML = head + quizHTML(ch);
  else if (G.mode === "pinyin") area.innerHTML = head + pinyinHTML(ch);
  else if (G.mode === "hunt") { area.innerHTML = huntHTML(); return; }
}

/* --- 模式1：识字卡片 --- */
function flashHTML(ch) {
  const info = CHAR_MAP[ch];
  return `
  <div class="card flash-stage">
    <div class="flash-char" onclick="speak('${escapeApos(ch)}')">
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
  const pool = G.kind === "study" ? G.chars : ALL_CHARS;
  const opts = [ch, ...sample(pool, 3, ch)];
  const shuffled = shuffle(opts);
  setTimeout(() => speak(ch), 300);
  return `
  <div class="card">
    <div class="game-q">🔊 听指令，锁定你听到的字
      <button class="btn btn-secondary" onclick="speak('${escapeApos(ch)}')">再听一遍 🔂</button>
    </div>
    <div class="options-grid">
      ${shuffled.map(o => `<button class="opt-btn" data-pick="${o}" data-right="${ch}" data-char="${ch}" onclick="answer(this,'${o}','${ch}','${ch}')">${o}</button>`).join("")}
    </div>
    <div class="feedback" id="fb"></div>
  </div>`;
}

/* --- 模式3：看字选拼音 --- */
function pinyinHTML(ch) {
  const info = CHAR_MAP[ch];
  // 从去重拼音列表中抽取干扰项，确保不重复
  const others = sample(ALL_PINYIN, 3, info.p);
  const opts = shuffle([info.p, ...others]);
  return `
  <div class="card">
    <div class="game-q">这个字怎么读？<span class="big">${ch}</span></div>
    <div class="options-grid">
      ${opts.map(o => `<button class="opt-btn pinyin-opt" data-pick="${o}" data-right="${info.p}" data-char="${ch}" onclick="answer(this,'${o}','${info.p}','${ch}')">${o}</button>`).join("")}
    </div>
    <div class="feedback" id="fb"></div>
  </div>`;
}

/* --- 模式4：连连看（字 ↔ 拼音配对） --- */
const HUNT_BATCH = 6;
function huntHTML() {
  const batch = G.chars.slice(G.idx, G.idx + HUNT_BATCH);
  const batchLen = batch.length;
  G.hunt = { batchLen, done: new Set(), wrongMarked: new Set(), selChar: null, selPin: null, selCharEl: null, selPinEl: null };
  const charsSide = shuffle(batch);
  const pinsSide = shuffle(batch.map(c => CHAR_MAP[c].p));
  const groupIdx = Math.floor(G.idx / HUNT_BATCH) + 1;
  const groupTotal = Math.ceil(G.chars.length / HUNT_BATCH);
  const head = `
    <div class="game-head">
      <button class="btn btn-yellow" onclick="quitGame()">← 返回</button>
      <span class="streak">🎯 ${G.right} 命中 / ${G.wrong} 失误</span>
      <span style="font-weight:800">第 ${groupIdx}/${groupTotal} 组</span>
    </div>`;
  return `
  ${head}
  <div class="card">
    <div class="game-q">🔗 连连看：点一个字，再点对应的拼音，连成一对！</div>
    <div class="link-wrap">
      <div class="link-col">
        ${charsSide.map(c => `<div class="link-card" onclick="huntPickChar(this,'${escapeApos(c)}')">${c}</div>`).join("")}
      </div>
      <div class="link-col">
        ${pinsSide.map(p => `<div class="link-card pin" onclick="huntPickPin(this,'${escapeApos(p)}')">${p}</div>`).join("")}
      </div>
    </div>
    <div class="feedback" id="fb"></div>
  </div>`;
}
function huntPickChar(el, ch) {
  if (el.classList.contains("done")) return;
  if (G.hunt.selPin) {
    tryPair(ch, G.hunt.selPin, el, G.hunt.selPinEl);
  } else {
    if (G.hunt.selCharEl) G.hunt.selCharEl.classList.remove("sel");
    G.hunt.selChar = ch; G.hunt.selCharEl = el; el.classList.add("sel");
  }
}
function huntPickPin(el, p) {
  if (el.classList.contains("done")) return;
  if (G.hunt.selChar) {
    tryPair(G.hunt.selChar, p, G.hunt.selCharEl, el);
  } else {
    if (G.hunt.selPinEl) G.hunt.selPinEl.classList.remove("sel");
    G.hunt.selPin = p; G.hunt.selPinEl = el; el.classList.add("sel");
  }
}
function tryPair(ch, p, charEl, pinEl) {
  const info = CHAR_MAP[ch];
  if (info.p === p) {
    charEl.classList.add("done"); pinEl.classList.add("done");
    charEl.classList.remove("sel"); pinEl.classList.remove("sel");
    G.hunt.done.add(ch);
    // 如果该字之前配错被记过 wrong，撤回那条错误记录
    if (G.hunt.wrongMarked.has(ch)) {
      const st = S.charStat[ch];
      if (st && st.wrong > 0) st.wrong--;
      G.wrong = Math.max(0, G.wrong - 1);
      G.hunt.wrongMarked.delete(ch);
    }
    markResult(ch, true, G.kind); G.right++;
    fb("配对成功！🔗", true);
    G.hunt.selChar = G.hunt.selPin = G.hunt.selCharEl = G.hunt.selPinEl = null;
    if (G.hunt.done.size >= G.hunt.batchLen) {
      setTimeout(() => { G.idx += G.hunt.batchLen; nextRound(); }, 700);
    }
  } else {
    if (!G.hunt.wrongMarked.has(ch)) { markResult(ch, false, G.kind); G.wrong++; G.hunt.wrongMarked.add(ch); }
    fb("再想想～", false);
    charEl.classList.add("miss"); pinEl.classList.add("miss");
    setTimeout(() => { charEl.classList.remove("sel", "miss"); pinEl.classList.remove("sel", "miss"); }, 400);
    G.hunt.selChar = G.hunt.selPin = G.hunt.selCharEl = G.hunt.selPinEl = null;
  }
}

/* --- 通用答题 --- */
let ansLock = false;
function answer(el, pick, right, ch) {
  if (ansLock) return;
  ansLock = true;
  const ok = pick === right;
  if (ok) {
    el.classList.add("correct");
    markResult(ch, true, G.kind); G.right++;
    fb("命中！🎯", true);
  } else {
    el.classList.add("wrong");
    document.querySelectorAll(".opt-btn").forEach(b => {
      if (b.dataset.pick === right) b.classList.add("correct");
    });
    markResult(ch, false, G.kind); G.wrong++;
    fb(`正确答案：${ch}（${CHAR_MAP[ch].p}）`, false);
    speak(ch);
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
    if (!S.reviewCompleted) S.reviewCompleted = {};
    const done = new Set(S.reviewCompleted[fromDay] || []);
    if (fromDay === currentDayNum()) {
      done.add(0); // 当日即时巩固
    } else {
      // 一次巩固覆盖"已到窗口"的所有间隔（含之前漏掉的遗留）
      const elapsed = diffDays(S.startDate, todayStr());
      DATA.reviewIntervals.forEach(iv => { if (iv <= elapsed) done.add(iv); });
    }
    S.reviewCompleted[fromDay] = [...done];
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
    <div class="mascot mascot-celebrate">${mascotSVG("slash")}</div>
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
    <div class="card stats-hero">
      <h2 class="sec-title" style="color:#fff">📋 我的作战报告</h2>
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
        ${weak.map(c => `<div class="weak-char" onclick="speak('${escapeApos(c)}')" title="${CHAR_MAP[c].p}">${c}</div>`).join("")}
      </div>
    </div>` : `
    <div class="card empty-state"><div class="icon">🏆</div><p>太强了！目前零失误！</p></div>`}
  `;
}

/* ---------- 吉祥物：威龙·宇航员皮肤 + 线条刀（卡通化） ---------- */
function mascotSVG(action) {
  const cls = action === "slash" ? "mascot-svg slash" : "mascot-svg";
  return `
  <svg class="${cls}" viewBox="0 0 220 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="威龙宇航员吉祥物">
    <g class="sparkles">
      <text x="26" y="46" font-size="18" fill="#E0A526">✦</text>
      <text x="186" y="64" font-size="13" fill="#C75B39">✦</text>
      <text x="44" y="210" font-size="11" fill="#3F6B4F">✦</text>
    </g>
    <!-- 生命维持背包 -->
    <rect x="66" y="118" width="88" height="80" rx="18" fill="#3F6B4F" stroke="#2C2A24" stroke-width="3"/>
    <rect x="80" y="130" width="60" height="18" rx="9" fill="#E0A526"/>
    <!-- 身体太空服 -->
    <rect x="62" y="126" width="96" height="96" rx="24" fill="#F1EFE0" stroke="#C75B39" stroke-width="5"/>
    <!-- 胸前徽章 -->
    <circle cx="110" cy="170" r="17" fill="#C75B39"/>
    <path d="M110 159 l4.5 9 10 0 -8 7 3 10 -9.5 -6 -9.5 6 3 -10 -8 -7 10 0 z" fill="#E0A526"/>
    <!-- 腿 -->
    <rect x="80" y="214" width="23" height="34" rx="11" fill="#F1EFE0" stroke="#C75B39" stroke-width="4"/>
    <rect x="117" y="214" width="23" height="34" rx="11" fill="#F1EFE0" stroke="#C75B39" stroke-width="4"/>
    <!-- 头盔外壳 -->
    <circle cx="110" cy="78" r="50" fill="#C75B39"/>
    <circle cx="110" cy="78" r="43" fill="#F1EFE0"/>
    <!-- 面罩 -->
    <path d="M75 70 a35 35 0 0 1 70 0 a35 29 0 0 1 -70 0 z" fill="#2E6396"/>
    <ellipse cx="93" cy="59" rx="15" ry="9" fill="#a9cbe8" opacity=".85"/>
    <circle cx="120" cy="75" r="4.5" fill="#E0A526"/>
    <!-- 天线 -->
    <line x1="110" y1="28" x2="110" y2="13" stroke="#C75B39" stroke-width="4"/>
    <circle cx="110" cy="11" r="5" fill="#E0A526"/>
    <!-- 手臂 + 线条刀 -->
    <g class="arm">
      <rect x="146" y="138" width="46" height="16" rx="8" fill="#F1EFE0" stroke="#C75B39" stroke-width="4"/>
      <rect x="184" y="98" width="11" height="46" rx="5" fill="#2C2A24"/>
      <rect x="186" y="102" width="7" height="38" rx="3" fill="#566A7D"/>
      <rect x="178" y="138" width="24" height="8" rx="4" fill="#E0A526"/>
      <path d="M189 98 L202 28 L183 94 Z" fill="#d7dde3" stroke="#fff" stroke-width="1.5"/>
      <!-- 刀光 -->
      <path class="slash-fx" d="M150 58 Q205 18 232 78" fill="none" stroke="#E0A526" stroke-width="6" stroke-linecap="round" opacity="0"/>
    </g>
  </svg>`;
}

/* ---------- 启动 ---------- */
if (S) render();
