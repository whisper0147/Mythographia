# 国内部署（腾讯云 CloudBase）

`*.vercel.app` 在国内经常被干扰，校园网、部分运营商直接打不开。这个文件给出一条国内可访问的路径：
静态页放腾讯云静态托管，Dify 代理跑在云函数里，全程不依赖 Vercel。

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
2. 点 **文件管理** → 上传，选这两个文件：
   - `index.html`（必须）
   - `myth-traveler.html`（可选，独立版旅程，方便单独分享）
3. 页面上方会显示**默认域名**，形如 `https://xxxxx.tcloudbaseapp.com`，先复制下来

---

## 第二步：建云函数（AI 代理）

1. 控制台左侧 **云函数** → 新建云函数
2. 参数：
   - 函数名称：`chat`
   - 运行环境：**Node.js 18**（必须 18 以上，需要全局 fetch）
   - 创建方式：空白函数
3. 创建后进入在线编辑器，把仓库里 `cloudbase/chat.js` 的全部内容粘进去，替换掉默认代码 → **保存**
4. 同一页 **函数配置** → 环境变量，加一条：

```
DIFY_API_KEY = app-你的密钥
```

5. 函数配置里把**超时时间**改成 `30` 秒（默认 3 秒不够模型回答）

---

## 第三步：开 HTTP 访问

1. 控制台左侧 **HTTP 访问服务** → 新建
2. 路径填 `/chat`，关联云函数选 `chat` → 保存
3. 复制生成的访问地址，形如：

```
https://your-env.shanghai.app.tcloudbase.com/chat
```

**自检**：直接用浏览器打开这个地址，应看到

```json
{"ok":true,"service":"mythographia-dify-proxy","hint":"代理已就绪，用 POST 提问"}
```

看到 `"ok":false` 说明 `DIFY_API_KEY` 没配上，回到第二步第 4 点。

---

## 第四步：把地址填进网页

用记事本打开 `index.html`，找到第 30 行附近这一句：

```js
window.MYTHOS_API = '';
```

把云函数地址填进去：

```js
window.MYTHOS_API = 'https://your-env.shanghai.app.tcloudbase.com/chat';
```

保存，回到静态托管，**重新上传 `index.html`**（覆盖原文件）。

---

## 第五步：验证

1. 打开静态托管给你的域名
2. 按 F12 看控制台，应出现：`[mythos] Dify 代理：https://.../chat`
3. 点「进入询问」，随便问一句，能返回带出处的答案就全通了

---

## 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 页面能开，问询一直转圈 | 云函数超时太短 → 改成 30 秒 |
| 控制台报 CORS 错误 | HTTP 访问服务里把「跨域校验」关掉；函数本身已经带 CORS 头 |
| 云函数地址打开显示 `ok:false` | 环境变量 `DIFY_API_KEY` 没保存，或改完没重新部署 |
| 问询退回「本地词条」 | `window.MYTHOS_API` 没填、填错，或填完没重新上传 index.html |
| 想换回 Vercel | 把 `window.MYTHOS_API` 改回空字符串即可，默认走同源 `/api/chat` |
| 静态页 404 | 确认 `index.html` 传在静态托管的**根目录**，不是子文件夹里 |

---

## 也可以用阿里云

思路一样：OSS 静态网站托管放页面，函数计算 FC 跑 `cloudbase/chat.js`（改成 `exports.handler = async (event, context) => {}`，
入参取 `event` 的 body），再把函数的 HTTP 触发地址填进 `window.MYTHOS_API`。
