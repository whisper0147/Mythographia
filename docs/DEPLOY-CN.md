# 国内部署（腾讯云 CloudBase）

`*.vercel.app` 在国内经常被干扰，校园网、部分运营商直接打不开。这个文件给出一条国内可访问的路径：
静态页放腾讯云静态托管，Dify 代理跑在「HTTP 云函数」里，全程不依赖 Vercel。

默认域名不需要备案；绑定自己的域名才需要。

---

## 准备

1. 打开 [cloud.tencent.com](https://cloud.tencent.com)，微信扫码登录
2. 搜索「云开发 CloudBase」→ 开通 → 新建环境
   - 计费方式选 **按量计费**（有免费额度，个人演示够用）
   - 地域选离你近的（如上海）

---

## 第一步：传静态页

1. 控制台左侧 **静态网站托管** → 开通
2. 点 **文件管理** → 上传：
   - `index.html`（必须）
   - `myth-traveler.html`（可选，独立版旅程）
3. 页面上方会显示**默认域名**，形如 `https://xxxxx.tcloudbaseapp.com`，先复制下来

---

## 第二步：建云函数（Dify 代理）

> 新版 CloudBase 的云函数是「HTTP 服务型」：一个 `scf_bootstrap` 启动脚本 + 一个 `index.js` 起 Node 服务。
> 所以仓库里给的是 `cloudbase/index.js`（服务写法），不是 `exports.main` 那种老写法。

1. 左侧 **云函数 / 托管 → 函数管理 → 创建云函数**
2. 创建方式选 **通过模板创建**
3. 模板列表里选 **HTTP Node.js Hello World**
4. 底部「函数名称」清空，填 **`chat`**（创建后不可改）
5. 点右下角 **创建**
6. 进入函数后，左侧文件列表点 **`index.js`** → 编辑器里 **全选删除** → 粘贴仓库里 `cloudbase/index.js` 的全部内容 → **保存 / 部署**
7. 同一页 **函数配置**：
   - **环境变量**：加一条 `DIFY_API_KEY = app-你的密钥`
   - **超时时间**：改成 `30` 秒（默认太短，模型答不完）
   - 运行环境确认是 **Node.js 18** 及以上（需要全局 fetch）

---

## 第三步：拿到访问地址

函数详情页上方会显示 **访问地址**，形如：

```
https://xxxxx.shanghai.app.tcloudbase.com/
```

**自检**：浏览器直接打开这个地址，应看到

```json
{"ok":true,"service":"mythographia-dify-proxy","hint":"代理已就绪，用 POST 提问"}
```

看到 `"ok":false` → 环境变量没存上，回第二步第 7 点。

> 如果打开是 404 或空白，去 **HTTP 网关 / HTTP 访问服务** 里确认这个函数已经挂上路径（多数模板会自动挂好）。

---

## 第四步：把地址填进网页

用记事本打开 `index.html`，找到这一句（约第 30 行）：

```js
window.MYTHOS_API = '';
```

改成云函数的访问地址：

```js
window.MYTHOS_API = 'https://xxxxx.shanghai.app.tcloudbase.com/';
```

保存 → 回静态托管 → **重新上传 `index.html`**（覆盖）。

---

## 第五步：验证

1. 打开静态托管给你的域名
2. F12 控制台应出现：`[mythos] Dify 代理：https://xxxxx...`
3. 点「进入询问」，问一句，返回带出处的答案就全通了

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 创建按钮点不动 | 函数名称非法（只能用字母、数字、连字符）或重名，换 `chat2` 试试 |
| 页面能开，问询一直转圈 | 函数超时太短 → 改成 30 秒；或运行时低于 Node 18（没有 fetch） |
| 控制台报 CORS | 用仓库里这份 `index.js`（已带 CORS 头）；另可在 HTTP 网关里关掉「跨域校验」 |
| 访问地址打开显示 `ok:false` | `DIFY_API_KEY` 没保存，或改完环境变量没重新部署 |
| 问询退回「本地词条」 | `window.MYTHOS_API` 没填/填错，或改完没重新上传 `index.html` |
| 静态页 404 | 确认 `index.html` 传在静态托管**根目录**，不在子文件夹 |
| 想换回 Vercel | `window.MYTHOS_API` 改回空字符串，默认走同源 `/api/chat` |

---

## 也可以用阿里云

OSS 静态网站托管放页面；函数计算 FC 建一个「Web 函数 / HTTP 函数」，把 `cloudbase/index.js` 的
`server.listen(PORT, '0.0.0.0')` 保留即可（FC 会注入 `PORT`），再把 HTTP 触发地址填进 `window.MYTHOS_API`。
