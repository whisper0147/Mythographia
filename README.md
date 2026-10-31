# 世界神话史 · 星穹图志
**MYTHOGRAPHIA MVNDI — A Voyage Through Six Mythologies**

> 一个可以「问」、也可以「走」的世界神话史：六个神话体系，从星穹点进去，落到具体的石头上。

## 在线演示

| 入口 | 地址 | 说明 |
|---|---|---|
| 国内 | <https://mythographia-rolling-weasel-d8geixrjl5ec11027.webapps.tcloudbase.com> | 腾讯云静态托管 + SCF 云函数代理，国内访问稳定 |
| 海外 | <https://mythographia-yaogu.vercel.app> | Vercel 部署，部分国内网络可能打不开 |
| 离线 | `Mythographia-离线演示.zip` | 解压双击 `index.html`，四卷完整（AI 退回内置词条） |

---

## 一、项目介绍

### 它是什么

一个**单文件、零外部依赖**的世界神话史网站。打开就是一整片深空星图，六颗星标对应六个神话体系；点开一颗，先看一段源流，再决定是「问」还是「走」。

- **问**：接入 Dify 知识库应用的问答，答案会附上具体的典籍与圣地编号。
- **走**：进入「卷四 · 旅程」，在同样的六域里走过 36 处圣地——每一站都有真实照片、神话正文，以及**起源地建筑形制的推荐**（不是泛泛而谈的景点介绍，而是柱式、屋顶、轴线、材料这一层）。

### 为什么做这个

去旅行的人常站在一座神庙或一处土丘前，看不懂眼前的东西：帕特农为什么故意做得不直，金字塔的通道为什么朝北，纽格莱奇的冬至光是从哪个口子进来的。神话解释了「为什么建」，建筑记录了「怎么建」，两者通常是分开讲的。

这个项目把它们缝在一起：**神话 → 圣地 → 建筑形制**，一条线走完。

### 六个神话体系

| 域 | 神话 | 圣殿（程序化 3D 主建筑） | 站点数 |
|---|---|---|---|
| `gr` 希腊罗马 | 奥林匹斯 · 泰坦之战 · 秘仪 | 帕特农神庙 | 6 |
| `eg` 埃及 | 九柱神 · 奥西里斯 · 太阳舟 | 吉萨大金字塔 | 6 |
| `cn` 中国 | 山海经 · 封禅 · 古蜀 | 岱庙天贶殿（重檐歇山） | 6 |
| `jp` 日本 | 记纪神话 · 让国 · 神佛习合 | 伊势神宫（唯一神明造） | 6 |
| `ie` 爱尔兰 | 达努之子 · 阿尔斯特传奇 | 纽格莱奇通道墓 | 6 |
| `cel` 凯尔特 | 德鲁伊 · 三界 · 石圈 | 巨石阵 | 6 |

---

## 二、技术架构

### 一句话

**一个 HTML 文件 + 一个 Serverless 函数**。没有构建步骤、没有框架、没有 npm 依赖、没有任何外部请求（除用户主动提问时的那一次代理调用）。

### 四卷结构

```
壹 星穹   canvas 星图 + 6 个 DOM 星标（CSS 3D 球体，可拖拽旋转）
   │     点击星标 → 镜头转向节点 → 弹出谱系面板（进入旅程 / 求问）
   ▼
贰 谱系   六大体系的家族树与关系索引
叁 图版   卡片墙 + 典籍书单
肆 旅程   内嵌「神话旅人」：天球 → 圣殿 → 等距地图 → 图志卡片
```

### 卷四的执行链路

```
谱系面板「进入这一卷的旅程」
   └─▶ openJourney(pid)
         ├─ go(3)                      切到第四卷
         └─ ensureJourney(pid)
              ├─ 从 <script type="text/template"> 取出旅人源码
              ├─ 按 pid 改写章节与深链守卫
              ├─ 注入 <style> 隐藏旅人自带顶栏
              └─ 灌进 iframe.srcdoc
```

为什么用 iframe 隔离：两套应用都占用了 `$`、`.btn`、`.stage`、`body` 这类全局名，硬合必然互相污染；隔离后两边的 CSS/JS 互不影响，Dify 询问链路零改动。

### 三幕的渲染原理

| 幕 | 技术 | 关键点 |
|---|---|---|
| 天球 | Canvas 2D | 经纬线用 `Path2D` 分批描边；星标是 DOM 按钮，与 canvas 共享投影函数 |
| 圣殿 | CSS 3D（`preserve-3d`） | 只用三个原语 `box()` / `panel()` / `face()` 拼装；曲面屋顶用 `wedge()` 逐面旋转贴合 |
| 地图 | CSS 3D 等距投影 | `.map-world` 用 `rotateX(58deg) rotateZ(-30deg)`，节点与人物反向旋转做 billboard；小人沿 Catmull-Rom 路径用 `getPointAtLength` 行走 |

> 详细设计取舍见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

### 目录

```
Mythographia/
├── index.html              网站本体（四卷 + 内嵌旅人，2.3 MB 单文件）
├── myth-traveler.html      「神话旅人」独立版（可单独打开）
├── api/chat.js             Dify 代理函数（Key 只在服务器环境变量）
├── vercel.json             部署配置
├── package.json            脚本与引擎声明（无第三方依赖）
├── .env.example            环境变量模板
├── 技术文档.docx          技术文档 Word 版（可编辑）
├── 技术文档-世界神话史星穹图志.pdf   技术文档 PDF（24 页，提交用）
├── docs/technical-doc.html 技术文档源文件（可重新导出）
├── ARCHITECTURE.md         架构与实现细节
├── docs/ASSETS.md          36 张图片的来源与授权清单
├── LICENSE                 MIT
└── README.md               本文件
```

---

## 三、安装与运行

### 0. 前置

- Node.js ≥ 18（只用于本地起静态服务与部署 CLI；**网站本身不需要 Node 运行**）
- 现代浏览器（Chrome / Edge / Safari 16.4+）

### 1. 本地直接看

双击 `index.html` 即可。此模式下是**词条模式**：不联网、不调 AI，问句由内置词条回答。
（这是设计好的降级路径：`location.protocol === 'file:'` 时不尝试请求代理。）

### 2. 本地起服务（推荐，能看到完整行为）

```bash
npx serve .          # 或：npx http-server -p 3000
# 打开 http://localhost:3000
```

> 起服务后若未配置 Key，提问仍会降级到词条模式并给出提示，属预期行为。

### 3. 部署上线

见下方「五、部署」。

---

## 四、环境配置

### 环境变量

| 变量 | 必填 | 说明 | 示例 |
|---|---|---|---|
| `DIFY_API_KEY` | ✅ | Dify 应用的 API Key（**只放在服务器**） | `app-xxxxxxxxxxxxxxxx` |
| `DIFY_ENDPOINT` | ❌ | 自定义 Dify 地址 | `https://api.dify.ai/v1/chat-messages` |
| `ALLOW_ORIGIN` | ❌ | 代理允许的来源域名，默认 `*` | `https://mythos.example.com` |

模板见 [`.env.example`](./.env.example)。

### 依赖清单

| 类别 | 依赖 | 说明 |
|---|---|---|
| 运行时 | 无 | 浏览器原生跑，无框架、无库、无 CDN |
| 服务端 | Node.js 18+（Vercel 内置 `fetch`） | 仅 `api/chat.js` 使用 |
| 第三方 npm 包 | **0 个** | `package.json` 中 `dependencies` 为空 |
| 外部服务 | Dify（知识库问答） | 可整站不接：不配 Key 时自动降级为内置词条 |

### 安全说明

API Key **绝不写入前端**。浏览器只请求同源的 `/api/chat`，Key 在函数进程内从环境变量读取：

```
浏览器 ──POST /api/chat {query}──▶ Vercel 函数 ──Bearer $DIFY_API_KEY──▶ Dify
```

函数含同 IP 每分钟 30 次限流，可用 `ALLOW_ORIGIN` 收窄来源。

---

## 五、部署

以 Vercel 为例（免费额度足够）：

```bash
cd Mythographia
npx vercel login
npx vercel --prod
```

然后在 Vercel 项目 **Settings → Environment Variables** 添加 `DIFY_API_KEY`，再 **Redeploy**。

国内网络打不开 `vercel.app` 时，改用腾讯云 CloudBase 部署，步骤见 [`docs/DEPLOY-CN.md`](docs/DEPLOY-CN.md)。
详细步骤、故障排查表见文末「八、常见问题」。

---

## 六、团队信息

| 项 | 内容 |
|---|---|
| 团队名称 | 垚谷队 |
| 所属单位 | 西安交通大学 |
| 成员 | 闫锦诚 · 张嘉伟 · 史马睿 |
| 指导教师 | 无 |
| 联系方式 | 1700140371@qq.com |

工作覆盖四卷与部署层：星穹/谱系/图版、旅人三幕、内容与图版绘制、部署与安全。

---

## 七、开发与维护

```bash
npx serve .                                  # 本地预览
node --check <(sed -n '/<script>/,/<\/script>/p' index.html)   # 粗查语法（macOS/Linux）
npm run check                                # 见 package.json，Windows 可用
```

已知限制与后续计划：

- 首屏需下载 2.3 MB（旅人内嵌）。后续可把旅人拆为 `journey.html` 懒加载，首屏降到约 1.1 MB。
- 圣殿为 CSS 3D，非真实网格模型；好处是零依赖、可读源码，代价是细节停留在建筑体量与构件层面。
- 移动端为 500 px 起验证，窄屏下图志卡片行高仍有优化空间。

---

## 八、常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 提问返回 500「DIFY_API_KEY 未配置」 | 环境变量没加 / 没重新部署 | 加变量 → Redeploy |
| 404 `/api/chat` | 文件不在 `api/` 目录，或托管方不支持函数 | 确认目录；换 Vercel / Netlify Functions |
| 提问一直走词条 | 页面以 `file://` 打开，或代理报错降级 | 用 http(s) 地址打开；看 Network 里 `chat` 响应 |
| Dify 返回 401 | Key 失效 | 重新签发并更新环境变量 |
| 卷四空白 | iframe 被浏览器扩展拦截 | 换浏览器或关闭拦截扩展 |

---

## 九、素材与授权

- **图片**：36 张实景照片均来自 Wikimedia Commons，许可为 CC0 / CC BY / CC BY-SA / 公有领域，逐张署名与授权见 [`docs/ASSETS.md`](./docs/ASSETS.md)。
- **代码**：MIT，见 [`LICENSE`](./LICENSE)。
- **字体**：仅使用系统字体栈，未引入任何网络字体。
- **内容**：神话叙述由项目撰写；年代、尺寸、构造数据以公开考古与建筑史资料为准，正文中保留具体数值与方位以便核对。

---

## 十、Git 历史

仓库按实际开发阶段提交，每个阶段对应真实产物：

1. `星穹图志` 四卷骨架、谱系与图版
2. `神话旅人` 六域 36 站、六座程序化 3D 圣殿
3. 两者融合：卷四旅程 + Dify 代理
4. 提交材料：架构文档、环境变量模板、素材授权清单
5. 技术文档：24 页 PDF（项目概述 / 需求分析 / 架构 / AI 方案 / 实现 / 测试部署 / 创新点）

提交信息遵循 Conventional Commits（`feat:` / `docs:` / `fix:` / `chore:`）。
