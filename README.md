# 🌈 暑假识字乐园

> 一年级升二年级 · 20 天学会二年级上册 607 个生字

一个为小朋友设计的识字网站：**每日学习 + 艾宾浩斯记忆曲线复习 + 跨终端同步**，纯前端 + Cloudflare 免费服务，零成本运行。

## ✨ 功能

### 📖 每日学习模块（4 种多样化练习）
| 模式 | 说明 |
|---|---|
| 🃏 识字卡片 | 大字卡片 + 拼音 + 点读发音（语音合成） |
| 🔊 听音选字 | 听读音，从 4 个字中选出听到的字 |
| 🅿️ 看字选拼音 | 看汉字选正确拼音 |
| 🔍 火眼金睛 | 在 12 个字中快速找到目标字 |

### 🔁 每日复习模块（艾宾浩斯记忆曲线）
- 学过的字在第 **1、2、4、7、15** 天自动到期复习
- **错题优先**排在复习最前面，另有「错题强化训练营」随时加练
- 自动制定每日任务（新学 + 复习）

### ☁️ 跨终端同步（Cloudflare Workers KV）
- 电脑 / iPad / 手机共享同一份进度
- **同步码即凭证**（如 `SHIZI-K7M2QX`），无需注册、无需 token
- 每次练习结束自动上传，换设备输入同步码即可合并进度
- 智能合并：多台设备记录取并集，每个字保留对错次数最多的

## 📁 项目结构

```
├── index.html / style.css / app.js   网站前端（纯静态）
├── data.js                           607 生字库 + 20 天计划（gen_data.py 生成）
├── sync.js                           跨终端同步（浏览器端，调 Worker API）
├── wrangler.toml                     网站静态部署配置
└── worker/
    ├── worker.js                     同步 API（Cloudflare Worker）
    └── wrangler.toml                 Worker 配置（KV 绑定）
```

---

## 🚀 部署步骤（Cloudflare 图形界面，全部免费）

只需 **2 个 Worker**：一个托管网站，一个做同步 API。

### 第 1 步：创建 KV 命名空间（存进度数据）

1. 打开 https://dash.cloudflare.com → 左侧 **Workers & Pages**
2. 点上方 **KV** 标签 → **Create a namespace**
3. 名称填：`SYNC_KV` → **Add**
4. 创建后点进去，**复制 Namespace ID**（一串 32 位字符），等下要用

### 第 2 步：部署同步 API Worker

1. 左侧 **Workers & Pages** → **Create application** → **Create Worker**
2. 名称填：`shizi-sync-api` → **Deploy**（先部署个空的）
3. 部署完点 **Edit code**，把左侧代码全部删掉，粘贴 `worker/worker.js` 的内容 → 右上角 **Save and deploy**
4. 回到 Worker 页面 → **Settings** 标签 → **Variables** → **KV Namespace Bindings** → **Add binding**：
   - Variable name: `SYNC_KV`
   - KV namespace: 选刚创建的 `SYNC_KV`
   - **Save and deploy**
5. 你的 API 地址就是：`https://shizi-sync-api.<你的子域>.workers.dev`

### 第 3 步：把 API 地址填进前端

打开 `sync.js` 第 7 行，改成你的 Worker 地址：
```js
const SYNC_API = "https://shizi-sync-api.你的子域.workers.dev";
```

### 第 4 步：部署网站（两种方式任选）

**方式 A：本地命令行（最快）**
```bash
npm install -g wrangler
wrangler login          # 浏览器授权一次
wrangler deploy         # 在项目根目录执行，用根目录的 wrangler.toml
```
得到 `https://shizi-leyuan.<你的子域>.workers.dev`

**方式 B：GitHub 自动部署（以后改代码自动上线）**
1. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 授权 GitHub → 选 `shizi-leyuan` 仓库
3. Framework preset 选 `None`，Build command 留空，Output directory 填 `/`
4. **Save and Deploy**，以后 push 代码自动重新部署

---

## ✅ 验证同步是否成功

1. 打开部署好的网站 → 点「☁️ 同步」→「🆕 生成我的同步码」
2. 如果生成出 `SHIZI-XXXXXX` 且提示"已上传"，说明 KV 绑定成功 ✅
3. 用浏览器无痕窗口打开同一网址 →「☁️ 同步」→ 输入刚才的同步码 →「加入已有同步」→ 进度一致即成功

---

## 🛠️ 本地开发

```bash
npx serve .             # 起本地服务器跑网站
wrangler dev            # 在 worker/ 目录本地调试同步 API
pip install pypinyin && python gen_data.py   # 重新生成字库
```

## 📚 字库说明

字表来自部编版二年级上册语文教材，8 个单元去重后共 607 字，按课文顺序拆为 20 天、每天约 31 字。拼音由 pypinyin 生成并人工修正多音字。

## 💰 免费额度（Cloudflare Free）

| 项目 | 额度 | 说明 |
|---|---|---|
| Workers 请求 | 10 万次/天 | 网站访问 + API |
| KV 读 | 10 万次/天 | 拉取进度 |
| KV 写 | 1000 次/天 | 保存进度 |
| KV 存储 | 1 GB | 一份进度仅几 KB |

个人使用绰绰有余。

---

祝小朋友学习愉快！🎒🌟
