// 神话志 · Dify 代理（Vercel Serverless Function）
// 作用：把浏览器的请求转给 Dify，API Key 只存在于服务器环境变量里，永远不会出现在网页源码中。
//
// 部署前在 Vercel 项目的 Settings → Environment Variables 里加：
//   DIFY_API_KEY = app-xxxxxxxxxxxxxxxx        （必填）
//   DIFY_ENDPOINT = https://api.dify.ai/v1/chat-messages   （可选，默认就是它）
//   ALLOW_ORIGIN  = https://你的域名            （可选，默认 *）

const DIFY_ENDPOINT =
  process.env.DIFY_ENDPOINT || 'https://api.dify.ai/v1/chat-messages';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

// 简易限流：同一个实例内，单 IP 每分钟最多 30 次
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { t: now, n: 0 };
  if (now - rec.t > 60000) { rec.t = now; rec.n = 0; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > 30;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const key = process.env.DIFY_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'DIFY_API_KEY 未配置',
      hint: '在 Vercel 项目 Settings → Environment Variables 里加上 DIFY_API_KEY，然后重新部署'
    });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: '请求太频繁，请稍后再试' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const query = String(body.query || '').slice(0, 2000).trim();
  if (!query) return res.status(400).json({ error: 'query 不能为空' });

  const payload = {
    inputs: {},
    query,
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
      return res.status(r.status).json({
        error: 'Dify 返回 ' + r.status,
        detail: detail.slice(0, 500)
      });
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

    return res.status(200).json({
      answer: d.answer || '',
      conversation_id: d.conversation_id || '',
      sources
    });
  } catch (err) {
    return res.status(502).json({ error: '代理请求失败', detail: String(err).slice(0, 300) });
  }
};
