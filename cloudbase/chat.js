// 神话志 · Dify 代理（腾讯云 CloudBase 云函数版）
// 与仓库里的 api/chat.js 逻辑一致，只是把入参/返回换成云函数的格式。
//
// 控制台要做两件事：
//   1) 云函数 → chat → 函数配置 → 环境变量：DIFY_API_KEY = app-xxxxxxxx
//   2) 云开发 → HTTP 访问服务 → 新建路径 /chat → 关联云函数 chat
// 运行时请选 Node.js 18 及以上（需要全局 fetch）。

const DIFY_ENDPOINT =
  process.env.DIFY_ENDPOINT || 'https://api.dify.ai/v1/chat-messages';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

const CORS = {
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};

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

function reply(code, obj) {
  return { statusCode: code, headers: CORS, body: JSON.stringify(obj) };
}

exports.main = async function (event) {
  event = event || {};
  const method = String(event.httpMethod || event.requestContext?.httpMethod || 'POST').toUpperCase();

  // 浏览器预检
  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  const key = process.env.DIFY_API_KEY;

  // 直接用浏览器打开这个地址时给一个自检结果，方便确认部署成功
  if (method === 'GET') {
    return reply(200, {
      ok: !!key,
      service: 'mythographia-dify-proxy',
      hint: key ? '代理已就绪，用 POST 提问' : '还没配 DIFY_API_KEY'
    });
  }
  if (method !== 'POST') return reply(405, { error: 'method not allowed' });
  if (!key) {
    return reply(500, {
      error: 'DIFY_API_KEY 未配置',
      hint: '云开发控制台 → 云函数 → chat → 函数配置 → 环境变量，加一条 DIFY_API_KEY'
    });
  }

  const h = event.headers || {};
  const ip = String(
    h['x-forwarded-for'] || h['x-real-ip'] || h['X-Forwarded-For'] ||
    (event.requestContext && event.requestContext.sourceIp) || 'unknown'
  ).split(',')[0].trim();
  if (rateLimited(ip)) return reply(429, { error: '请求太频繁，请稍后再试' });

  let body = event.body;
  if (event.isBase64Encoded && typeof body === 'string') {
    body = Buffer.from(body, 'base64').toString('utf8');
  }
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const query = String(body.query || '').slice(0, 2000).trim();
  if (!query) return reply(400, { error: 'query 不能为空' });

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
      return reply(r.status, { error: 'Dify 返回 ' + r.status, detail: detail.slice(0, 500) });
    }

    const d = await r.json();

    // 把 Dify 的检索结果整理成前端要的 sources: [{ code }]
    const sources = ((d.metadata && d.metadata.retriever_resources) || [])
      .map(function (x) {
        const name = String(x.document_name || '');
        const m = name.match(/([A-Z]{2,5}-\d{2,4})/);
        return m ? { code: m[1] } : null;
      })
      .filter(Boolean);

    return reply(200, {
      answer: d.answer || '',
      conversation_id: d.conversation_id || '',
      sources: sources
    });
  } catch (err) {
    return reply(502, { error: '代理请求失败', detail: String(err).slice(0, 300) });
  }
};
