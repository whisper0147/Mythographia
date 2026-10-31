# -*- coding: utf-8 -*-
# 神话志 · Dify 代理（腾讯云 SCF 事件函数 · Python 3 版）
# 适用于误建为 Python 运行时的函数：把本文件内容整段粘进控制台的 index.py 即可。
# 函数入口保持 index.main_handler；环境变量 DIFY_API_KEY；执行超时 30 秒。

import base64
import json
import os
import re
import time
import urllib.error
import urllib.request

DIFY_ENDPOINT = os.environ.get('DIFY_ENDPOINT') or 'https://api.dify.ai/v1/chat-messages'
ALLOW_ORIGIN = os.environ.get('ALLOW_ORIGIN') or '*'

CORS = {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
}

_hits = {}


def _rate_limited(ip):
    """同一实例内，单 IP 每分钟最多 30 次"""
    now = time.time()
    rec = _hits.get(ip)
    if not rec or now - rec[0] > 60:
        rec = [now, 0]
    rec[1] += 1
    _hits[ip] = rec
    return rec[1] > 30


def _reply(code, obj):
    return {
        'isBase64Encoded': False,
        'statusCode': code,
        'headers': CORS,
        'body': json.dumps(obj, ensure_ascii=False),
    }


def main_handler(event, context):
    event = event or {}
    method = str(event.get('httpMethod') or 'POST').upper()

    if method == 'OPTIONS':
        return {'isBase64Encoded': False, 'statusCode': 204, 'headers': CORS, 'body': ''}

    key = os.environ.get('DIFY_API_KEY')

    # 浏览器直接打开时给一个自检结果
    if method == 'GET':
        return _reply(200, {
            'ok': bool(key),
            'service': 'mythographia-dify-proxy',
            'hint': '代理已就绪，用 POST 提问' if key else '还没配 DIFY_API_KEY',
        })

    if method != 'POST':
        return _reply(405, {'error': 'method not allowed'})

    if not key:
        return _reply(500, {
            'error': 'DIFY_API_KEY 未配置',
            'hint': 'SCF 控制台 → 函数配置 → 环境变量，加一条 DIFY_API_KEY',
        })

    headers = event.get('headers') or {}
    ip = str(headers.get('x-forwarded-for') or headers.get('X-Forwarded-For')
             or headers.get('x-real-ip') or 'unknown').split(',')[0].strip()
    if _rate_limited(ip):
        return _reply(429, {'error': '请求太频繁，请稍后再试'})

    body = event.get('body')
    if event.get('isBase64Encoded') and isinstance(body, str):
        try:
            body = base64.b64decode(body).decode('utf-8')
        except Exception:
            body = ''
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except Exception:
            body = {}
    body = body or {}

    query = str(body.get('query') or '')[:2000].strip()
    if not query:
        return _reply(400, {'error': 'query 不能为空'})

    payload = {
        'inputs': {},
        'query': query,
        'response_mode': 'blocking',
        'conversation_id': body.get('conversation_id') if isinstance(body.get('conversation_id'), str) else '',
        'user': (body.get('user') or 'mythos-web')[:64],
    }

    req = urllib.request.Request(
        DIFY_ENDPOINT,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + key,
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=28) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as err:
        detail = err.read().decode('utf-8', 'replace')[:500]
        return _reply(err.code, {'error': 'Dify 返回 %s' % err.code, 'detail': detail})
    except Exception as err:
        return _reply(502, {'error': '代理请求失败', 'detail': str(err)[:300]})

    sources = []
    meta = data.get('metadata') or {}
    for item in (meta.get('retriever_resources') or []):
        m = re.search(r'([A-Z]{2,5}-\d{2,4})', str(item.get('document_name') or ''))
        if m:
            sources.append({'code': m.group(1)})

    return _reply(200, {
        'answer': data.get('answer') or '',
        'conversation_id': data.get('conversation_id') or '',
        'sources': sources,
    })
