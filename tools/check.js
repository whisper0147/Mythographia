#!/usr/bin/env node
/**
 * tools/check.js — 提交前自检
 *
 * 做四件事，全部只读，不改任何文件：
 *   1. 抽取 index.html 里的 <script> 块做语法检查（不执行）
 *   2. 确认源码里没有泄漏 Dify API Key（app- 开头的高熵串）
 *   3. 统计体积与外部请求数（应为 0）
 *   4. 确认四卷与 36 个站点数据齐全
 *
 * 用法：node tools/check.js  （或 npm run check）
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(ROOT, 'index.html');

let failed = 0;
const ok = (msg) => console.log('  ✓ ' + msg);
const bad = (msg) => { failed++; console.log('  ✗ ' + msg); };

if (!fs.existsSync(FILE)) {
  console.error('找不到 index.html，请在项目根目录运行');
  process.exit(1);
}

const html = fs.readFileSync(FILE, 'utf8');
const size = Buffer.byteLength(html, 'utf8');

console.log('\n[1/4] 内联脚本语法');
const blocks = [];
// 用扫描器而不是单个正则：模板块的内容里含有被转义的 </script，正则容易越界
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let mm;
while ((mm = re.exec(html)) !== null) {
  const attrs = mm[1] || '';
  const mType = attrs.match(/type\s*=\s*["']?([^"'\s>]+)/i);
  const type = mType ? mType[1].toLowerCase() : '';
  if (type && !/(text\/javascript|application\/javascript|module)/.test(type)) continue; // 跳过 text/template 数据块
  blocks.push([mm[0], mm[2]]);
}
if (!blocks.length) bad('没有找到内联脚本');
blocks.forEach((m, i) => {
  const src = m[1];
  if (!src.trim()) return;
  try {
    // 只解析、不执行
    new Function(src);
    ok(`脚本 #${i + 1} 语法通过（${(src.length / 1024).toFixed(0)} KB）`);
  } catch (e) {
    bad(`脚本 #${i + 1} 语法错误：${e.message}`);
  }
});

console.log('\n[2/4] 密钥泄漏检查');
const leaks = (html.match(/app-[A-Za-z0-9]{16,}/g) || [])
  .filter(s => !/^app-(.)\1{10,}$/.test(s));   // 排除 app-xxxx 这类文档占位符
if (leaks.length) bad(`发现疑似 API Key ${leaks.length} 处：${leaks[0].slice(0, 12)}…`);
else ok('源码中没有 Dify API Key');

console.log('\n[3/4] 体积与外部依赖');
ok(`index.html ${(size / 1024 / 1024).toFixed(2)} MB`);
const ext = (html.match(/(?:src|href)="https?:\/\//g) || []).length;
if (ext) bad(`发现 ${ext} 处外部资源引用（应为 0）`);
else ok('零外部资源引用');

console.log('\n[4/4] 结构完整性');
const plates = (html.match(/class="plate[" ]/g) || []).length;
const stations = new Set((html.match(/key: '[a-z]+', no: '0\d'/g) || []));
const photos = (html.match(/photo: "data:image\/webp/g) || []).length;
plates >= 4 ? ok(`版面 ${plates} 卷`) : bad(`版面只有 ${plates} 卷（应为 4）`);
stations.size === 36 ? ok('站点数据 36 条') : bad(`站点数据 ${stations.size} 条（应为 36）`);
photos === 36 ? ok('内联照片 36 张') : bad(`内联照片 ${photos} 张（应为 36）`);

console.log('\n' + (failed ? `自检未通过：${failed} 项问题\n` : '全部通过。\n'));
process.exit(failed ? 1 : 0);
