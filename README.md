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
├── sync.js                           跨终端同步（浏览器端，调同源 API）
├── functions/sync/[[code]].js        同步 API（Pages Functions，读写 KV）
└── wrangler.toml                     本地 wrangler 部署配置（可选）
```

---

## 🚀 部署步骤（Cloudflare Pages，一个项目搞定全部）

网站和同步 API 都在**同一个 Pages 项目**里（Pages Functions 自动识别 `functions/` 目录）。

### 第 1 步：创建 KV 命名空间

1. https://dash.cloudflare.com → 左侧 **Workers & Pages** → 上方 **KV** 标签
2. **Create a namespace** → 名称 `SYNC_KV` → **Add**

### 第 2 步：部署网站（GitHub 自动部署）

1. **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 授权 GitHub → 选 `shizi-leyuan` 仓库
3. Framework preset 选 `None`，Build command 留空，Output directory 填 `/`
4. **Save and Deploy**，得到 `https://xxx.pages.dev`

### 第 3 步：给 Pages 项目绑定 KV

1. 打开你的 Pages 项目 → **Settings** → **Functions**
2. **KV namespace bindings** → **Add binding**：
   - Variable name: `SYNC_KV`
   - KV namespace: 选刚创建的 `SYNC_KV`
   - Environment 选 `Production`（建议 Production 和 Preview 都加）
3. **Save** → 回到 **Deployments** → 最新部署点 **⋯** → **Retry deployment**（重新部署让绑定生效）

✅ 完成！同步 API 地址就是 `/sync`（与网站同源），前端已用相对路径，**无需改任何代码**。

> 💡 以后 push 代码到 GitHub，Pages 自动重新部署。

---

## ✅ 验证同步是否成功

1. 打开 `https://xxx.pages.dev` → 点「☁️ 同步」→「🆕 生成我的同步码」
2. 生成出 `SHIZI-XXXXXX` 且提示"已上传"，说明 KV 绑定成功 ✅
3. 无痕窗口打开同一网址 → 输入同一同步码 →「加入已有同步」→ 进度一致即成功

> 也可直接测 API：`curl https://xxx.pages.dev/sync/SHIZI-ABC123` 应返回 404 而不是 502/500（404 说明 Function 正常工作了）

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
