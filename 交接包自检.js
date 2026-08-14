// 模拟 mentor 拿到 zip 后的完整流程，验证交接包真的能用。
// 关键：解压到一个干净目录，只用包里的东西，不依赖原项目。
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const fflate = require('./fflate.min.js');

const ZIP = path.join(__dirname, 'AI排期系统_交接包.zip');
const TMP = path.join(os.tmpdir(), 'handover-test-' + Date.now().toString(36));

console.log('解压到干净目录：' + TMP + '\n');
const files = fflate.unzipSync(new Uint8Array(fs.readFileSync(ZIP)));
Object.keys(files).forEach(function (n) {
  const dst = path.join(TMP, n);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, Buffer.from(files[n]));
});

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  → ' + extra : '')); }
}

// ---------- 1. 结构完整性 ----------
console.log('=== 1. 目录结构 ===');
['源码/index.html', '源码/xlsx-js-style.min.js', '源码/fflate.min.js',
 '文档/维护速查.md', '文档/排期工具_维护手册.md', '文档/代码索引.md',
 '测试/verify_smartsheet.js', '工具/deploy.js', '交接说明.md'].forEach(function (f) {
  ok('存在 ' + f, fs.existsSync(path.join(TMP, f)));
});

// ---------- 2. 源码是最新版（含智能表格 + 别名表 + 严格管线判定）----------
console.log('\n=== 2. 源码版本 ===');
const html = fs.readFileSync(path.join(TMP, '源码/index.html'), 'utf8');
ok('含智能表格解析 parseSmartsheetTable', html.indexOf('parseSmartsheetTable') >= 0);
ok('含子分类别名表 CATEGORY_SUB_ALIASES', html.indexOf('CATEGORY_SUB_ALIASES') >= 0);
ok('含严格管线判定 isStrictPipelineName', html.indexOf('isStrictPipelineName') >= 0);
ok('含脏列过滤 SMARTSHEET_JUNK_FIELD', html.indexOf('SMARTSHEET_JUNK_FIELD') >= 0);
ok('CATEGORY_TREE key 已是规范名「系统文学设定」',
  html.indexOf("'系统文学设定': 'lit-system'") >= 0);
ok('不含已废弃的旧 key 定义',
  html.indexOf("'系统性设定': 'lit-system'") < 0);

// ---------- 3. 语法校验（交接说明第四节的第①步）----------
console.log('\n=== 3. 语法校验（按交接说明的命令）===');
const vm = require('vm');
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m, blocks = 0, bad = 0;
while ((m = re.exec(html)) !== null) {
  if (/\bsrc\s*=/.test(m[0].slice(0, m[0].indexOf('>')))) continue;
  blocks++;
  try { new vm.Script(m[1]); } catch (e) { bad++; console.log('     块' + blocks + ': ' + e.message); }
}
ok('内联 script 语法无错误（' + blocks + ' 块）', bad === 0, bad + ' 个错误');

// ---------- 4. 回归测试能在包内独立跑起来 ----------
console.log('\n=== 4. 回归测试（测试/verify_smartsheet.js）===');
const vs = fs.readFileSync(path.join(TMP, '测试/verify_smartsheet.js'), 'utf8');
// 关键：脚本不能写死路径，否则在交接包的目录布局下（源码/index.html）跑不起来
ok('脚本会自动定位源码（不写死路径）', vs.indexOf('function locate') >= 0);
ok('脚本兼容交接包布局（源码/index.html）', vs.indexOf('源码/index.html') >= 0);
ok('样例文件缺失时优雅跳过（不报错）', vs.indexOf('SAMPLE') >= 0 && vs.indexOf('跳过用例') >= 0);

// ★ 直接在包的原始目录结构下跑，不做任何适配 —— 这才是 mentor 的真实场景
let out = '', code = 0;
try {
  out = execSync('node verify_smartsheet.js', {
    cwd: path.join(TMP, '测试'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) {
  out = (e.stdout || '') + (e.stderr || '');
  code = e.status || 1;
}
const mm = out.match(/PASS (\d+) \/ FAIL (\d+)/);
if (mm) {
  ok('在包的原始目录结构下能直接跑（' + mm[1] + ' 项，FAIL ' + mm[2] + '）',
    mm[2] === '0' && code === 0, out.slice(-400));
} else {
  ok('在包的原始目录结构下能直接跑', false, out.slice(-500));
}

// 再测「机器上没有样例 xlsx」的情况 —— mentor 大概率就是这样
const noSample = vs.replace(/'C:\/Users\/[^']*世界观需求录入表单\.xlsx'/, "'Z:/nope/x.xlsx'");
fs.writeFileSync(path.join(TMP, '测试/_nosample.js'), noSample, 'utf8');
let out3 = '', code3 = 0;
try {
  out3 = execSync('node _nosample.js', {
    cwd: path.join(TMP, '测试'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) { out3 = (e.stdout || '') + (e.stderr || ''); code3 = e.status || 1; }
const m3 = out3.match(/PASS (\d+) \/ FAIL (\d+)/);
ok('缺样例文件时不报错、优雅降级（' + (m3 ? m3[1] + ' 项' : '?') + '）',
  !!m3 && m3[2] === '0' && code3 === 0 && out3.indexOf('跳过') >= 0,
  out3.slice(-300));
fs.unlinkSync(path.join(TMP, '测试/_nosample.js'));

// ---------- 5. 索引生成器能跑 ----------
console.log('\n=== 5. 代码索引生成器 ===');
const gi = fs.readFileSync(path.join(TMP, '工具/gen-code-index.js'), 'utf8');
ok('索引生成器也自动定位源码', gi.indexOf('function locateSrc') >= 0);
let out2 = '', code2 = 0;
try {
  out2 = execSync('node gen-code-index.js --check', {
    cwd: path.join(TMP, '工具'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) { out2 = (e.stdout || '') + (e.stderr || ''); code2 = e.status || 1; }
ok('在包的原始目录结构下能定位全部标识符',
  out2.indexOf('全部标识符都能定位') >= 0 && code2 === 0, out2.trim().slice(-300));

// ---------- 6. 文档没有失效引用 ----------
console.log('\n=== 6. 文档质量 ===');
const manual = fs.readFileSync(path.join(TMP, '文档/排期工具_维护手册.md'), 'utf8');
const quick = fs.readFileSync(path.join(TMP, '文档/维护速查.md'), 'utf8');
const handover = fs.readFileSync(path.join(TMP, '交接说明.md'), 'utf8');

ok('维护手册无 4 位数行号区间引用', !/[0-9]{4}[–-][0-9]{4}/.test(manual));
ok('维护手册提到了智能表格', manual.indexOf('智能表格') >= 0);
ok('维护手册提到了两条发布链路', manual.indexOf('两条链路') >= 0);
ok('维护手册提到了 verify_smartsheet', manual.indexOf('verify_smartsheet') >= 0);
ok('速查表提到了 _cfgVersion 规则', quick.indexOf('_cfgVersion') >= 0);
ok('速查表有排查顺序表', quick.indexOf('排查顺序') >= 0);
ok('交接说明版本号是 v75.2', handover.indexOf('v75.2') >= 0);
ok('交接说明提到维护速查', handover.indexOf('维护速查') >= 0);
ok('交接说明未残留 v74 字样', handover.indexOf('v74') < 0);

// 章节交叉引用有效性
const secNums = (manual.match(/^## (\d+)\./gm) || []).map(function (s) { return s.match(/\d+/)[0]; });
const refs = Array.from(new Set((manual.match(/§(\d+)/g) || []).map(function (s) { return s.slice(1); })));
const dangling = refs.filter(function (r) { return secNums.indexOf(r) < 0; });
ok('维护手册章节交叉引用全部有效', dangling.length === 0, '悬空引用 §' + dangling.join(', §'));

console.log('\n================================');
console.log('  PASS ' + pass + ' / FAIL ' + fail);
console.log('================================');
console.log('\n测试目录（可手动检查）：' + TMP);
process.exit(fail ? 1 : 0);
