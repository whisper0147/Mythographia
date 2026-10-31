// 神话志 · Dify 代理（CloudBase HTTP 函数版）
// 对应控制台模板「HTTP Node.js Hello World」：自带 scf_bootstrap，node 起一个 http 服务。
// 你只需要把 index.js 的内容整段换成这份，然后在「函数配置 → 环境变量」里加 DIFY_API_KEY。
//
// 自检：用浏览器打开函数访问地址，返回 {"ok":true,...} 就是通了。

const http = require('http');

const DIFY_ENDPOINT =
  process.env.DIFY_ENDPOINT || 'https://api.dify.ai/v1/chat-messages';
const PORT = process.env.PORT || 9000;

// 简易限流：同一实例内，单 IP 每分钟最多 30 次
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > 60000) { rec.t = now; rec.n = 0; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > 30;
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // 网页在另一个域名，必须放开跨域
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  const key = process.env.DIFY_API_KEY;

  // 浏览器直接打开：给一个自检结果
  if (req.method === 'GET') {
    return json(res, 200, {
      ok: !!key,
      service: 'mythographia-dify-proxy',
      hint: key ? '代理已就绪，用 POST 提问' : '还没配 DIFY_API_KEY'
    });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'method not allowed' });
  if (!key) {
    return json(res, 500, {
      error: 'DIFY_API_KEY 未配置',
      hint: '控制台 → 云函数 → 函数配置 → 环境变量，加一条 DIFY_API_KEY'
    });
  }

  const ip = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  if (rateLimited(ip)) return json(res, 429, { error: '请求太频繁，请稍后再试' });

  let raw = '';
  try {
    for await (const chunk of req) raw += chunk;
  } catch (e) {
    return json(res, 400, { error: '读取请求体失败' });
  }
  let body = {};
  try { body = JSON.parse(raw || '{}'); } catch (e) { body = {}; }

  const query = String(body.query || '').slice(0, 2000).trim();
  if (!query) return json(res, 400, { error: 'query 不能为空' });

  const payload = {
    inputs: {},
    query: query,
    response_mode: 'blocking',
    conversation_id: typeof body.conversation_id === 'string' ? body.conversation_id : '',
    user: typeof body.user === 'string' && body.user ? body.user.slice(0, 64) : 'mythos-web'
  };

  try {
    const r = await fetch(DIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const detail = await r.text();
      return json(res, r.status, { error: 'Dify 返回 ' + r.status, detail: detail.slice(0, 500) });
    }

    const d = await r.json();

    // Dify 的检索结果 → 前端要的 sources: [{ code }]
    const sources = ((d.metadata && d.metadata.retriever_resources) || [])
      .map(function (x) {
        const name = String(x.document_name || '');
        const m = name.match(/([A-Z]{2,5}-\d{2,4})/);
        return m ? { code: m[1] } : null;
      })
      .filter(Boolean);

    return json(res, 200, {
      answer: d.answer || '',
      conversation_id: d.conversation_id || '',
      sources: sources
    });
  } catch (err) {
    return json(res, 502, { error: '代理请求失败', detail: String(err).slice(0, 300) });
  }
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('mythographia chat proxy listening on ' + PORT);
});
