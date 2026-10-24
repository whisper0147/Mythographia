# 架构与实现细节

本文记录「星穹图志」的技术选型、关键实现与踩过的坑，供评审与后续维护参考。

---

## 1. 总体形态

```
┌──────────────────────────── index.html（2.3 MB） ────────────────────────────┐
│  <style>    约 850 行，含设计变量、四卷布局、旅人全部样式、六域圣殿材质     │
│  <header>   顶栏：品牌 / 四卷标签 / 历史记录 / 进入询问                      │
│  <main>     四个 .plate（绝对定位叠放，切换时用 3D 位移+透明度过渡）        │
│    ├ plate-0 星穹   canvas 星图 + 6 个 DOM 星标 + 谱系面板                   │
│    ├ plate-1 谱系   家族树与关系索引                                         │
│    ├ plate-2 图版   卡片墙 + 典籍书单                                        │
│    └ plate-3 旅程   iframe（srcdoc 灌入旅人整站）                            │
│  <script>   约 1200 行：状态机、渲染、Dify 调用、卷四装载器                  │
│  <script type="text/template" id="journeySrc">  旅人整站源码（转义后）      │
└──────────────────────────────────────────────────────────────────────────────┘
        │
        └── api/chat.js   Vercel Serverless：代理 Dify，Key 在环境变量
```

**为什么是单文件**：评审/分享时「一个文件即全站」，不依赖 CDN、不依赖构建、断网也能打开（除 AI 提问）。代价是体积，见 §6。

---

## 2. 四卷与状态机

`go(i)` 是唯一入口：切换 `.plate.is-active`、更新圆点、页码、翻页按钮禁用态，并在 `i === 3` 时按需装载旅人。

```js
function go(i) {
  i = Math.max(0, Math.min(plates.length - 1, i));
  if (i !== 0) unlockSphere();            // 离开星穹时把球体复位
  plates.forEach((p, k) => { ... });
  dots.forEach(...); tabs.forEach(...);
  pgCount.textContent = String(i + 1).padStart(2, '0') + ' / ' + String(plates.length).padStart(2, '0');
  ...
  if (i === 3 && !journeyPid && !bootingJourney) ensureJourney(null);
}
```

四卷完全由 DOM 决定，没有额外的路由层：`?page=N` 仅用于深链调试。

---

## 3. 星穹：canvas + DOM 混合

- canvas 负责星野、经纬线与大气光晕（`Path2D` 分批描边，避免每帧重建路径）。
- 星标不是 canvas 绘制，而是绝对定位的 DOM 按钮：可聚焦、可键盘操作、可挂 tooltip，且点击热区好控。
- 两者共用同一个投影函数 `project(lat, lon)`，保证「球转星标跟」。
- 锁定某个谱系时给 `#sphereZoom` 加 `rotateY` 位移 + `scale`，镜头转向该节点；离开时清除 transform 复位。

**坑**：节点 label 的防重叠用「已放置矩形 + 相交检测」，转动时每帧重算；早期版本在移动端会抖动，改为按 z 轴深度排序后再放置即稳定。

---

## 4. 卷四：为什么用 iframe，以及怎么做得像一卷

两套应用各自都有 `$` / `$$` / `.btn` / `.stage` / `body` 这类全局，CSS 变量 `--ease`、`--ink` 也重名。直接合并需要把 4000+ 行脚本命名空间化、把 850 行 CSS 加前缀 —— 风险高、收益低。

因此采用**同源 iframe + srcdoc**：

1. 旅人源码存进 `<script type="text/template">`，内容做两处转义：
   - `</script` → `<\/script`
   - `<!--` → `<\!--`
   > 第二处是必须的：脚本数据状态里出现 `<!--` 会进入 escaped，再遇到 `<script` 进入 double-escaped，块尾的 `</script>` 就关不掉，整个文档会被吞进去。
2. 进卷四时取出、还原、按谱系打补丁、灌进 `iframe.srcdoc`。
3. 注入 `<style>.bar{display:none}</style>` 隐藏旅人自带的顶栏 —— 图志的顶栏成为唯一 chrome。
4. iframe 铺满 `.plate` 区域（`padding:0; perspective:none`），视觉上就是一卷图版。

### 两条入口，行为不同

| 入口 | 行为 | 实现 |
|---|---|---|
| 顶栏「肆 旅程」 | 先给**天球**，自己点星标 | `ensureJourney(null)`，不注入深链补丁，`deepLink()` 因无 hash 直接 return |
| 谱系面板「进入这一卷的旅程」 | 直达**该卷圣殿** | 注入 `enterChapter('<pid>')`，连 `body.ch-xx` 一起设好 |

去重：`journeyPid` 记录当前已装载内容，`'__globe__'` 表示天球；切走再回来不重载。

---

## 5. 旅人三幕

### 5.1 圣殿：CSS 3D 程序化拼装

只有三个原语：

```js
box(w, h, d, x, y, z, {front, sideR, sideL, top})   // 长方体，y 是底边
panel(w, h, x, yBottom, z, rotY, cls, extra)        // 单片面板
face(w, h, transform, cls)                          // 单个面
```

- 帕特农：三级台基 + 46 根柱（柱身 20 道凹槽用 `repeating-linear-gradient`）+ 额枋 + 山花。
- 金字塔：四个裁角三角面围成锥体，表面叠石材层理渐变。
- 天贶殿（中国）：重檐歇山，用 `wedge(rotY, wBot, {inner, outer, topW}, yTop, yBot)` 逐面旋转贴合；重檐 = 内缘贴墙的裙檐环 + 顶部歇山。
- 伊势（日本）：掘立柱高床 + 萱葺切妻 + 千木鲣木 + 玉垣。
- 纽格莱奇（爱尔兰）：`ring()` 生成 20 段环形坡面堆成穹丘 + 缘石圈 + 白色石英立面。
- 巨石阵（凯尔特）：30 根砂岩柱 + 30 根横楣 + 20 根青石 + 5 座三石塔 + 土堤壕沟。

**最大的坑**：基础规则 `.b>i{background:#c9bea9}` 权重 (0,1,1) 会盖掉材质类 `.f-xxx` (0,1,0)，导致整栋建筑变成一片米色。所有材质类必须写成 `.b .f-xxx`。

### 5.2 地图：等距投影 + 行走

- `.map-world` 施加 `rotateX(58deg) rotateZ(-30deg)` 形成等距视角；
- 节点与人物反向旋转做 billboard，避免被压扁；
- 路径是 `catmullD(NODES.map(n => [n.x, n.y]))` 生成的平滑曲线，人物用 `getPointAtLength` 沿路径推进；
- 相机对位必须计入透视：`w = 1 - z/1400`，`cam.ty = oyL + (offY - oyL) * w`。按纯 2D 线性算会偏 200+ px。

### 5.3 地图地形

每域一套程序化 SVG：希腊罗马（爱琴海群岛）、埃及（尼罗河与三角洲）、中国（黄河几字弯 + 长江 + 长城）、日本（本州弧 + 九州四国北海道 + 富士山）、爱尔兰（岛形 + 博因河）、凯尔特（不列颠 + 布列塔尼 + 海峡）。全部由 `buildTerrainXX()` 生成，节点小图版是 6 幅手绘线刻（`*_LITH`）。

---

## 6. 体积与性能

| 项 | 数值 | 说明 |
|---|---|---|
| 单文件 | 2.3 MB | 其中旅人约 1.2 MB |
| 图片 | 36 张 WebP，约 700 KB | 640 px 宽、单张 ≤20 KB，二分搜索质量 |
| 首屏可交互 | 约 1.2 s（本地） | 主要是解析 2.3 MB HTML |
| 运行时依赖 | 0 | 无网络请求（除提问） |

**压缩策略**：所有照片统一重编码到 640 px 宽，用二分搜索把质量压到 17 KB 以内，个别细节多的图再降一档分辨率；卡片实际显示宽度约 380 px，肉眼无可察损失。

**后续优化方向**：把旅人拆成独立 `journey.html` 懒加载，首屏降至 1.1 MB。

---

## 7. 安全

- 前端 `MYTHOS_CONFIG` 留空 → 自动走同源 `/api/chat`；
- `api/chat.js` 从 `process.env.DIFY_API_KEY` 读 Key，永不返回给浏览器；
- 同 IP 每分钟 30 次限流；`ALLOW_ORIGIN` 可收窄来源；
- 请求体只透传 `query` / `conversation_id` / `user`，并对 `query` 做长度截断。

---

## 8. 无障碍与降级

- 星标、标签、按钮均为原生可聚焦元素，带 `aria-label`；
- `prefers-reduced-motion` 下关闭旋转与过渡；
- 无 JS 时静态内容（图版、谱系）仍可阅读；
- Dify 不可用时自动降级为内置词条，不阻塞主流程。
