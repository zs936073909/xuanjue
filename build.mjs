// build.mjs — 玄决构建管线
// 用法：
//   node build.mjs           校验并同步 www（Capacitor webDir）+ 自动生成 SW 预缓存清单
//   node build.mjs vendor    从 node_modules 重建 vendor 大库（需先 npm install）
//   node build.mjs --no-minify 写入 www 前不压缩应用 JS（默认压缩，源码始终可读）
//
// 设计原则：源码树是唯一来源，www 为可复现的生成产物；SW 预缓存清单由文件系统扫描得出，
// 杜绝「新增脚本忘记加入离线缓存」导致的离线白屏。
import { build as esbuild } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(ROOT, 'www');
const JS_SRC = path.join(ROOT, 'js');
const XHS_DIST = path.join(ROOT, 'dist-xhs');
// 默认压缩：www 为部署产物（首屏 JS 需 < 500KB）；测试始终跑未压缩源码，便于排查
const MINIFY = !process.argv.includes('--no-minify');
// 小工具容器包排除的生物识别 WebAuthn 文件（容器禁凭据 API，扫描会被判 CRITICAL）
const XHS_EXCLUDE_JS = ['bio-unlock.js'];
let MODE = process.argv.includes('vendor') ? 'vendor' : 'www';
if (process.argv.includes('xhs')) MODE = 'xhs';

// 原样镜像到 www 的静态资源
const STATIC_DIRS = ['css', 'data', 'img'];
const STATIC_FILES = ['index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];
// data/ 由 Service Worker 的 DATA_CACHE 运行时缓存（网络优先），不进安装期预缓存
const PRECACHE_SKIP_PREFIX = ['data/', 'service-worker.js'];

// vendor 大库：npm 包 → window.X 全局（见 build/*-entry.js）
const VENDOR_BUILDS = [
  { entry: 'build/iching-entry.js', out: 'js/vendor/iching-shifa.min.js' },
  { entry: 'build/qimen-entry.js', out: 'js/vendor/qimendunjia-standalone.min.js' },
  { entry: 'build/tarot-entry.js', out: 'js/vendor/tarot-kit.min.js' }
];
const VENDOR_COPY = [{ from: 'node_modules/iztro/dist/iztro.min.js', out: 'js/iztro.min.js' }];

function log(...a) { console.log(...a); }
function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }
function copyFile(src, dest) { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.copyFileSync(src, dest); }
function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dest, e.name);
    if (e.isDirectory()) copyTree(s, d); else fs.copyFileSync(s, d);
  }
}
function kb(n) { return (n / 1024).toFixed(1) + 'KB'; }

// ---------- vendor：从 node_modules 重建大库 ----------
async function buildVendor() {
  log('[vendor] 从 node_modules 重建术数大库');
  for (const v of VENDOR_BUILDS) {
    const entryAbs = path.join(ROOT, v.entry);
    if (!fs.existsSync(entryAbs)) { log('  ! 缺少入口', v.entry, '跳过'); continue; }
    await esbuild({
      entryPoints: [entryAbs],
      outfile: path.join(ROOT, v.out),
      bundle: true, minify: true, format: 'iife', target: ['es2019'],
      charset: 'utf8', legalComments: 'inline', logLevel: 'warning'
    });
    log('  ✓', v.out, kb(fs.statSync(path.join(ROOT, v.out)).size));
  }
  for (const c of VENDOR_COPY) {
    const fromAbs = path.join(ROOT, c.from);
    if (!fs.existsSync(fromAbs)) { log('  ! 缺少', c.from, '（请先 npm install）跳过'); continue; }
    copyFile(fromAbs, path.join(ROOT, c.out));
    log('  ✓', c.out, '(copy)', kb(fs.statSync(path.join(ROOT, c.out)).size));
  }
  log('[vendor] 完成');
}

// ---------- www：镜像源码 + 校验 JS ----------
async function copyJsToWww() {
  fs.mkdirSync(path.join(WWW, 'js'), { recursive: true });
  for (const e of fs.readdirSync(JS_SRC, { withFileTypes: true })) {
    const src = path.join(JS_SRC, e.name);
    if (e.isDirectory()) { copyTree(src, path.join(WWW, 'js', e.name)); continue; }
    if (!e.name.endsWith('.js')) continue;
    // 已压缩的第三方产物原样拷贝，避免二次处理与体积膨胀
    if (e.name.endsWith('.min.js')) { copyFile(src, path.join(WWW, 'js', e.name)); continue; }
    const code = fs.readFileSync(src, 'utf8');
    const res = await esbuild({
      stdin: { contents: code, sourcefile: src, loader: 'js' },
      bundle: false, minify: MINIFY, target: ['es2019'], charset: 'utf8',
      write: false, logLevel: 'warning'
    });
    fs.writeFileSync(path.join(WWW, 'js', e.name), res.outputFiles[0].text);
  }
}

// 递归列出 www 内所有文件（posix 相对路径）
function walkFiles(dir, rel, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walkFiles(path.join(dir, e.name), r, acc); else acc.push(r);
  }
  return acc;
}

function assetList() {
  const files = walkFiles(WWW, '', []);
  const include = files.filter((r) => !PRECACHE_SKIP_PREFIX.some((p) => r === p || r.startsWith(p)));
  const list = ['./'].concat(include.map((r) => './' + r));
  list.sort((a, b) => (a === './' ? -1 : b === './' ? 1 : a.localeCompare(b)));
  return list;
}

function extractSwAssets(code) {
  const m = code.match(/const STATIC_ASSETS = \[([\s\S]*?)\];/);
  if (!m) return null;
  return (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
}

function generateSw() {
  const assets = assetList();
  const swSrc = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const block = 'const STATIC_ASSETS = [\n' + assets.map((a) => "  '" + a + "'").join(',\n') + '\n];';
  const re = /const STATIC_ASSETS = \[[\s\S]*?\];/;
  if (!re.test(swSrc)) throw new Error('无法在 service-worker.js 中定位 STATIC_ASSETS 块，已中止以免产出残缺 SW');
  const out = swSrc.replace(re, block);
  fs.writeFileSync(path.join(WWW, 'service-worker.js'), out);
  return assets;
}

// 源码 SW 清单与文件系统实际不符时给出漂移告警（源码为模板，www 为最终产物）
function checkDrift(assets) {
  const srcAssets = extractSwAssets(fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8'));
  if (!srcAssets) return;
  const missing = assets.filter((a) => a !== './' && !srcAssets.includes(a));
  if (missing.length) {
    log('   service-worker.js 源码清单缺少 ' + missing.length + ' 项（www 内已自动补全）：');
    missing.slice(0, 8).forEach((m) => log('      ' + m));
    if (missing.length > 8) log('      …');
  }
}

async function buildWww() {
  log('[www] 清空并重建', path.relative(ROOT, WWW));
  rmrf(WWW);
  fs.mkdirSync(WWW, { recursive: true });
  for (const d of STATIC_DIRS) {
    const s = path.join(ROOT, d);
    if (fs.existsSync(s)) copyTree(s, path.join(WWW, d));
  }
  for (const f of STATIC_FILES) {
    const s = path.join(ROOT, f);
    if (fs.existsSync(s)) copyFile(s, path.join(WWW, f));
  }
  await copyJsToWww();
  const assets = generateSw();
  checkDrift(assets);
  const total = walkFiles(WWW, '', []).reduce((n, r) => n + fs.statSync(path.join(WWW, r)).size, 0);
  const firstJs = ['js/lunar.js', 'js/huangli.js', 'js/daliuren.js', 'js/shushu.js', 'js/store.js', 'js/ai.js', 'js/classics.js', 'js/cross.js', 'js/vendor-loader.js', 'js/app.js'];
  const shell = ['index.html', 'css/style.css'];
  const sizeOf = (list) => list.reduce((n, r) => n + (fs.existsSync(path.join(WWW, r)) ? fs.statSync(path.join(WWW, r)).size : 0), 0);
  const jsSize = sizeOf(firstJs), shellSize = sizeOf(shell);
  log('[www] 完成：预缓存 ' + assets.length + ' 项，www 合计 ' + kb(total) +
    '，首屏 JS ' + kb(jsSize) + '，首屏必需 ' + kb(jsSize + shellSize) + (MINIFY ? '（已压缩）' : '（未压缩）'));
  if (jsSize > 500 * 1024) log('  ! 首屏 JS 超过 500KB 目标，可考虑进一步拆分（如结果页按需加载）');
}

// ---------- xhs：小红书小工具容器适配版 ----------
// 与 www 的差异：容器禁内联脚本 / 禁凭据 API / 禁 SW / 禁 manifest，且不联网，
// 因此去除 bio-unlock.js（WebAuthn）、service-worker.js、manifest.json 与 PWA 相关 meta，
// 脚本目标降至面向容器最低基线的 ES2017，并压缩 zip（index.html 位于 zip 根目录）。
function containerIndexHtml() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const remove = [
    '<meta name="theme-color" content="#1F1E1D">\n',
    '<meta name="mobile-web-app-capable" content="yes">\n',
    '<meta name="apple-mobile-web-app-capable" content="yes">\n',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n',
    '<meta name="apple-mobile-web-app-title" content="玄决">\n',
    '<link rel="manifest" href="manifest.json">\n',
    '<link rel="apple-touch-icon" href="icon-192.png">\n',
    '<script src="js/bio-unlock.js"></script>\n'
  ];
  for (const line of remove) html = html.split(line).join(''); // 可缺失，逐一安全移除
  if (html.includes('bio-unlock')) throw new Error('容器 index.html 仍包含 bio-unlock 引用');
  return html;
}

async function copyJsForXhs() {
  fs.mkdirSync(path.join(XHS_DIST, 'js'), { recursive: true });
  for (const e of fs.readdirSync(JS_SRC, { withFileTypes: true })) {
    const src = path.join(JS_SRC, e.name);
    if (e.isDirectory()) { copyTree(src, path.join(XHS_DIST, 'js', e.name)); continue; }
    if (!e.name.endsWith('.js')) continue;
    if (XHS_EXCLUDE_JS.includes(e.name)) { log('  排除', e.name); continue; }
    if (e.name.endsWith('.min.js')) { copyFile(src, path.join(XHS_DIST, 'js', e.name)); continue; }
    const code = fs.readFileSync(src, 'utf8');
    const res = await esbuild({
      stdin: { contents: code, sourcefile: src, loader: 'js' },
      bundle: false, minify: true, target: ['es2017'], charset: 'utf8',
      write: false, logLevel: 'warning'
    });
    fs.writeFileSync(path.join(XHS_DIST, 'js', e.name), res.outputFiles[0].text);
  }
}

function buildXhs() {
  log('[xhs] 构建小工具容器适配版 →', path.relative(ROOT, XHS_DIST));
  rmrf(XHS_DIST);
  fs.mkdirSync(XHS_DIST, { recursive: true });
  for (const d of STATIC_DIRS) {
    const s = path.join(ROOT, d);
    if (fs.existsSync(s)) copyTree(s, path.join(XHS_DIST, d));
  }
  for (const f of ['icon-192.png', 'icon-512.png']) {
    const s = path.join(ROOT, f);
    if (fs.existsSync(s)) copyFile(s, path.join(XHS_DIST, f));
  }
  fs.writeFileSync(path.join(XHS_DIST, 'index.html'), containerIndexHtml());
  return copyJsForXhs();
}

function packZip(srcDir, zipPath) {
  rmrf(zipPath);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  const tgt = path.join(ROOT, zipPath);
  // 进入 dist 目录再压缩「内容」，保证 index.html 位于 zip 根（容器硬性要求）
  execFileSync('zip', ['-q', '-r', tgt, '.'], {
    cwd: srcDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return kb(fs.statSync(tgt).size);
}

if (MODE === 'vendor') await buildVendor();
else if (MODE === 'xhs') {
  await buildXhs();
  const zip = 'releases/xuanjue-v1.5.0-xhs-tool.zip';
  const size = packZip(XHS_DIST, zip);
  const total = walkFiles(XHS_DIST, '', []).reduce((n, r) => n + fs.statSync(path.join(XHS_DIST, r)).size, 0);
  log('[xhs] 完成：dist 解压 ' + kb(total) + '，zip ' + path.relative(ROOT, zip) + ' ' + size);
  if (fs.statSync(path.join(ROOT, zip)).size > 10 * 1024 * 1024) log('  ! zip 超过 10MiB 上传上限');
} else await buildWww();