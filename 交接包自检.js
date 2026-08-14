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
 '文档/排期工具_维护手册.xlsx', '文档/排期甘特图_示例.xlsx',
 '文档/维护速查.md', '文档/排期工具_维护手册.md', '文档/代码索引.md',
 '测试/verify_smartsheet.js', '测试/verify_holiday.js',
 '工具/表单字段自检.js', '工具/gen-code-index.js', '工具/skill同步核对.js',
 '工具/deploy.js', '交接说明.md',
 // AI 助手版整份带进包 —— 原来写「想要的话找我拿」，人走了这句就失效
 'AI助手版/SKILL.md', 'AI助手版/cli.js', 'AI助手版/index.js',
 'AI助手版/parse_import.js', 'AI助手版/bot-dialog.js', 'AI助手版/run_skill.js',
 'AI助手版/export-gantt.js', 'AI助手版/read_xlsx.js', 'AI助手版/selftest.js',
 'AI助手版/package.json', 'AI助手版/怎么用.md'].forEach(function (f) {
  ok('存在 ' + f, fs.existsSync(path.join(TMP, f)));
});

// AI 助手版不能带隐私/垃圾文件
console.log('\n=== 1b. AI 助手版干净度 ===');
ok('不含 .sessions（对话记录有隐私）', !fs.existsSync(path.join(TMP, 'AI助手版/.sessions')));
{
  const od = path.join(TMP, 'AI助手版/output');
  const leftover = fs.existsSync(od) ? fs.readdirSync(od) : [];
  ok('不含 output 里跑出来的甘特图', leftover.length === 0, leftover.join(', '));
}

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
// v76：设置页可补录法定假期（mentor 无代码基础，必须能自己改）
ok('含用户可补录假期 userHolidays', html.indexOf('userHolidays') >= 0);
ok('含假期补录弹窗 holidayModal', html.indexOf('holidayModal') >= 0);
ok('配置版本升级不会冲掉用户补录的假期',
  html.indexOf('mergedCfg.userHolidays = DEFAULT_CONFIG') < 0);

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

// 假期功能的回归测试也要能在包内直接跑
let out4 = '', code4 = 0;
try {
  out4 = execSync('node verify_holiday.js', {
    cwd: path.join(TMP, '测试'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) { out4 = (e.stdout || '') + (e.stderr || ''); code4 = e.status || 1; }
const m4 = out4.match(/PASS (\d+) \/ FAIL (\d+)/);
ok('假期测试在包内能直接跑（' + (m4 ? m4[1] + ' 项' : '?') + '）',
  !!m4 && m4[2] === '0' && code4 === 0, out4.slice(-300));

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

// 表单字段自检也要能在包内直接跑（改了需求收集表时会用到）
let out5 = '', code5 = 0;
try {
  out5 = execSync('node 表单字段自检.js', {
    cwd: path.join(TMP, '工具'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) { out5 = (e.stdout || '') + (e.stderr || ''); code5 = e.status || 1; }
ok('表单字段自检在包内能直接跑（无参数时列出全部字段）',
  code5 === 0 && out5.indexOf('系统能识别的所有字段') >= 0 &&
  out5.indexOf('需求类型') >= 0 && out5.indexOf('应用与露出') >= 0,
  out5.trim().slice(-300));

// skill 同步核对也要能在包内跑。本机没装 skill 时应优雅跳过（退出码 0）而不是报错，
// 因为接手人大概率不装 skill —— 这脚本对他没用，但不能让他一跑就红。
let out6 = '', code6 = 0;
try {
  out6 = execSync('node skill同步核对.js', {
    cwd: path.join(TMP, '工具'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) { out6 = (e.stdout || '') + (e.stderr || ''); code6 = e.status || 1; }
ok('skill 同步核对在包内能跑（有 skill 则核对，没装则优雅跳过）',
  code6 === 0 && (out6.indexOf('skill 与网页版一致') >= 0 || out6.indexOf('跳过核对') >= 0),
  out6.trim().slice(-400));

// ★ AI 助手版必须能在包里直接跑起来 —— 接手人是从包里复制走的，
//   如果只有在我机器上能跑，那等于没给他。
console.log('\n=== 5b. AI 助手版能在包内直接跑 ===');
{
  const sd = path.join(TMP, 'AI助手版');
  function run(cmd) {
    try { return { out: execSync(cmd, { cwd: sd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), code: 0 }; }
    catch (e) { return { out: (e.stdout || '') + (e.stderr || ''), code: e.status || 1 }; }
  }
  const r1 = run('node -e "require(\'./index\'); console.log(\'REQUIRE_OK\')"');
  ok('引擎能被 require（零依赖，不用 npm install）',
    r1.code === 0 && r1.out.indexOf('REQUIRE_OK') >= 0, r1.out.trim().slice(-300));

  const r2 = run('node cli.js --fields');
  ok('cli.js --fields 能列出字段清单',
    r2.code === 0 && r2.out.indexOf('需求类型') >= 0 && r2.out.indexOf('应用与露出') >= 0,
    r2.out.trim().slice(-300));

  const r3 = run('node selftest.js');
  const m5 = r3.out.match(/PASS=(\d+)\s+FAIL=(\d+)/);
  ok('自检在包内全 PASS（' + (m5 ? m5[1] + ' 项' : '?') + '）',
    !!m5 && m5[2] === '0' && r3.code === 0, r3.out.trim().slice(-400));

  // skill 与网页版必须是同一版本（包里两份要一致，否则接手人两边行为不同）
  const sHtml = fs.readFileSync(path.join(TMP, '源码/index.html'), 'utf8');
  const sIdx = fs.readFileSync(path.join(sd, 'index.js'), 'utf8');
  const sPi = fs.readFileSync(path.join(sd, 'parse_import.js'), 'utf8');
  ok('AI 助手版含假期补录（与网页版同版本）', sIdx.indexOf('userHolidays') >= 0);
  ok('AI 助手版含智能表格解析', sPi.indexOf('parseSmartsheetTable') >= 0);
  ok('AI 助手版含子分类别名表', sPi.indexOf('CATEGORY_SUB_ALIASES') >= 0);
  ok('AI 助手版用规范名「系统文学设定」',
    sPi.indexOf("'系统文学设定': 'lit-system'") >= 0 || sIdx.indexOf("'系统文学设定': 'lit-system'") >= 0);
  ok('网页版也是同一规范名', sHtml.indexOf("'系统文学设定': 'lit-system'") >= 0);
}

// ---------- 6. 文档质量 ----------
console.log('\n=== 6. 文档质量 ===');
const manual = fs.readFileSync(path.join(TMP, '文档/排期工具_维护手册.md'), 'utf8');
const quick = fs.readFileSync(path.join(TMP, '文档/维护速查.md'), 'utf8');
const handover = fs.readFileSync(path.join(TMP, '交接说明.md'), 'utf8');

ok('维护手册无 4 位数行号区间引用', !/[0-9]{4}[–-][0-9]{4}/.test(manual));
ok('维护手册提到了智能表格', manual.indexOf('智能表格') >= 0);
ok('维护手册提到了 verify_smartsheet', manual.indexOf('verify_smartsheet') >= 0);
ok('速查表有排查顺序表', quick.indexOf('排查顺序') >= 0);

// 交接说明是给无代码基础的人看的，主入口必须指向 Excel 手册
ok('交接说明把 Excel 手册作为主入口', handover.indexOf('排期工具_维护手册.xlsx') >= 0);
ok('交接说明说明了假期怎么更新', handover.indexOf('法定假期') >= 0);
ok('交接说明说明了外网不再推送', handover.indexOf('不会再推送') >= 0);
ok('交接说明未残留 v74 字样', handover.indexOf('v74') < 0);

// 章节交叉引用有效性
const secNums = (manual.match(/^## (\d+)\./gm) || []).map(function (s) { return s.match(/\d+/)[0]; });
const refs = Array.from(new Set((manual.match(/§(\d+)/g) || []).map(function (s) { return s.slice(1); })));
const dangling = refs.filter(function (r) { return secNums.indexOf(r) < 0; });
ok('维护手册章节交叉引用全部有效', dangling.length === 0, '悬空引用 §' + dangling.join(', §'));

// ---------- 7. Excel 手册可读性（mentor 的主入口）----------
console.log('\n=== 7. Excel 维护手册 ===');
{
  const vm2 = require('vm');
  const xcode = fs.readFileSync(path.join(TMP, '源码/xlsx-js-style.min.js'), 'utf8');
  const sbx = {
    window: {}, console, Uint8Array, ArrayBuffer, Date, Math, JSON, String, Number,
    Array, Object, RegExp, Error, TextDecoder, TextEncoder, parseInt, parseFloat, isNaN, Set, Map
  };
  sbx.self = sbx.window; sbx.globalThis = sbx;
  vm2.createContext(sbx); vm2.runInContext(xcode, sbx);
  const XLSX = sbx.XLSX || sbx.window.XLSX;

  const wb = XLSX.read(new Uint8Array(fs.readFileSync(path.join(TMP, '文档/排期工具_维护手册.xlsx'))), { type: 'array' });
  ok('Excel 能被正常打开', !!wb && wb.SheetNames.length > 0);
  ['先读这个', '常见情况', '问AI模板', '出问题了', '表单该有哪些列', '包里有什么'].forEach(function (s) {
    ok('有工作表「' + s + '」', wb.SheetNames.indexOf(s) >= 0, wb.SheetNames.join(' / '));
  });

  // 全表文本不应出现代码术语（mentor 无代码基础）
  let allText = '';
  wb.SheetNames.forEach(function (n) {
    const ws = wb.Sheets[n];
    XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      .forEach(function (r) { allText += r.join(' ') + '\n'; });
  });
  const jargon = ['DEFAULT_ITEM_TIME', 'CATEGORY_TREE', 'parseSmartsheetTable',
    'localStorage', 'aoa', 'innerHTML', 'const ', 'function '];
  const found = jargon.filter(function (j) { return allText.indexOf(j) >= 0; });
  ok('全表无代码术语', found.length === 0, '出现了：' + found.join(', '));

  ok('提到了法定假期更新', allText.indexOf('假期') >= 0);
  ok('提到了问 AI 的做法', allText.indexOf('AI') >= 0);
  ok('提到了内网网址', allText.indexOf('ai-scheduling-board.pages.woa.com') >= 0);

  // ★ 关键：「表单该有哪些列」这页必须和代码里的真实取值一致。
  //   这页是给业务方定表格结构的依据，写错了会导致他们照着做出系统读不了的表。
  //   所以直接从源码里抓出真值逐个核对，而不是靠人肉维护。
  const src = html;
  function jsonFromSrc(declName) {
    const i = src.indexOf('const ' + declName + ' = {');
    if (i < 0) return null;
    let depth = 0, start = src.indexOf('{', i), end = -1;
    for (let k = start; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
    }
    return end < 0 ? null : src.slice(start, end + 1);
  }

  // 三个大类的子分类规范名
  const catSrc = jsonFromSrc('CATEGORY_TREE') || '';
  const subNames = (catSrc.match(/'([^']+)':\s*'(scene|char|lit)-[a-z]+'/g) || [])
    .map(function (s) { return s.match(/'([^']+)'/)[1]; });
  const missingSub = subNames.filter(function (n) { return allText.indexOf(n) < 0; });
  ok('表单页列全了所有子分类（' + subNames.length + ' 个）',
    missingSub.length === 0, '漏了：' + missingSub.join('、'));

  // 九条管线名
  const pipeNames = (src.match(/\{ id: '[a-z]+', name: '([^']+)', score:/g) || [])
    .map(function (s) { return s.match(/name: '([^']+)'/)[1]; });
  const missingPipe = pipeNames.filter(function (n) { return allText.indexOf(n) < 0; });
  ok('表单页列全了所有管线（' + pipeNames.length + ' 条）',
    pipeNames.length >= 9 && missingPipe.length === 0, '漏了：' + missingPipe.join('、'));

  // 产出物二级分类 + 每个具体项
  const asSrc = jsonFromSrc('ASSETS_TREE') || '';
  const mids = (asSrc.match(/'([^']+)':\s*\[/g) || []).map(function (s) { return s.match(/'([^']+)'/)[1]; });
  const missingMid = mids.filter(function (n) { return allText.indexOf(n) < 0; });
  ok('表单页列全了所有产出物分类（' + mids.length + ' 个）',
    missingMid.length === 0, '漏了：' + missingMid.join('、'));

  const items = [];
  (asSrc.match(/\[[^\]]*\]/g) || []).forEach(function (arr) {
    (arr.match(/'([^']+)'/g) || []).forEach(function (s) { items.push(s.slice(1, -1)); });
  });
  const missingItem = Array.from(new Set(items)).filter(function (n) { return allText.indexOf(n) < 0; });
  ok('表单页列全了所有可填产出项（' + new Set(items).size + ' 项）',
    missingItem.length === 0, '漏了：' + missingItem.join('、'));

  // 基础字段的规范列名
  ['需求名', 'DDL', '提需人', '需求描述'].forEach(function (n) {
    ok('表单页提到基础字段「' + n + '」', allText.indexOf(n) >= 0);
  });
}

console.log('\n================================');
console.log('  PASS ' + pass + ' / FAIL ' + fail);
console.log('================================');
console.log('\n测试目录（可手动检查）：' + TMP);
process.exit(fail ? 1 : 0);
