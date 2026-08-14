// 表单字段自检 —— 回答两个问题：
//   ① 系统到底能认哪些列？（标准表单该长什么样）
//   ② 我这份表单，系统逐列认成了什么？有没有认错/漏认？
//
// 用法：
//   node 表单字段自检.js                    ← 只列出系统支持的全部字段
//   node 表单字段自检.js 我的表单.xlsx       ← 再逐列对照这份表单
//
// 改了需求收集表（加列/改列名）后跑一遍，看有没有「⚠ 认不出来」。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function locate(cands, label) {
  for (const c of cands) {
    const p = path.isAbsolute(c) ? c : path.join(__dirname, c);
    if (fs.existsSync(p)) return p;
  }
  console.error('❌ 找不到' + label + '，试过：');
  cands.forEach(c => console.error('   ' + path.join(__dirname, c)));
  process.exit(1);
}
const HTML_PATH = locate([
  'ai-scheduling-board-v10.html',   // 原项目根目录
  '../ai-scheduling-board-v10.html',// 原项目 scripts/ 下
  '源码/index.html',                 // 交接包根目录
  '../源码/index.html'               // 交接包 工具/ 下
], '源码 HTML');
const XLSX_PATH = locate([
  'xlsx-js-style.min.js', '../xlsx-js-style.min.js',
  '源码/xlsx-js-style.min.js', '../源码/xlsx-js-style.min.js'
], 'xlsx-js-style.min.js');

const sbx = { window: {}, console, Uint8Array, ArrayBuffer, Date, Math, JSON, String, Number, Array, Object, RegExp, Error, TextDecoder, TextEncoder, parseInt, parseFloat, isNaN, Set, Map };
sbx.self = sbx.window; sbx.globalThis = sbx;
vm.createContext(sbx); vm.runInContext(fs.readFileSync(XLSX_PATH, 'utf8'), sbx);
const XLSX = sbx.XLSX || sbx.window.XLSX;

const lines = fs.readFileSync(HTML_PATH, 'utf8').split(/\r?\n/);
function grab(names) {
  const out = [];
  names.forEach(nm => {
    const re = new RegExp('^(function|const|let|var)\\s+' + nm + '\\b');
    let start = -1;
    for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { start = i; break; } }
    if (start < 0) { console.error('!! 未找到声明: ' + nm); process.exit(1); }
    let end = start;
    const first = lines[start].trim();
    const isOneLiner = /;$/.test(first) && !/[{[(]\s*$/.test(first);
    if (!isOneLiner) {
      end = -1;
      for (let i = start + 1; i < lines.length; i++) if (/^\};?\s*$/.test(lines[i])) { end = i; break; }
      if (end < 0) { console.error('!! 未找到结尾: ' + nm); process.exit(1); }
    }
    out.push(lines.slice(start, end + 1).join('\n'));
  });
  return out.join('\n\n');
}

const NEEDED = [
  'ASSETS_TREE', 'MIDS_WITH_ORDER', 'CATEGORY_TREE', 'CATEGORY_SUB_ALIASES',
  'resolveSubCategoryId', 'canonicalSubName', 'resolveCategory',
  'resolvePipelineId', 'resolvePipelineIds', 'expandAssetTokens', 'normalizeDDL',
  'SMARTSHEET_FIELD_MAP', 'SMARTSHEET_EMPTY', 'SMARTSHEET_CHECKED', 'SMARTSHEET_JUNK_FIELD',
  'normSmartsheetCell', 'normSmartsheetKey', 'splitSmartsheetMulti', 'smartsheetGroupKind',
  'findAssetMid', 'findBigOfAssetItem', 'isStrictPipelineName', 'sniffColumnKind',
  'resolveSubCategory', 'detectSmartsheetLayout', 'buildSmartsheetPlan',
  'parseSmartsheetTable', 'xlsxCellToText', 'stripMatrixPrefix', 'expandRecordCopies', 'parseCopyInfo'
];
const PIPES = [
  { id: 'hero', name: '英雄线' }, { id: 'arena', name: '战场玩法线' }, { id: 'system', name: '系统线' },
  { id: 'bible', name: 'Bible概念' }, { id: 'region', name: '区域概念' }, { id: 'narrative', name: '叙事' },
  { id: 'station', name: '站点' }, { id: 'cg', name: 'CG' }, { id: 'pv', name: 'PV' }
];
const harness = `
var state = { config: { pipelines: ${JSON.stringify(PIPES)}, people: [] } };
${grab(NEEDED)}
globalThis.__api = {};
${NEEDED.map(n => `globalThis.__api['${n}'] = typeof ${n} !== 'undefined' ? ${n} : undefined;`).join('\n')}
`;
const ctx = { console, JSON, Object, Array, String, Number, Math, Date, RegExp, Set, Map, parseInt, parseFloat, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx); vm.runInContext(harness, ctx);
const A = ctx.__api;

// ============ 第一部分：系统支持的全部字段 ============
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  系统能识别的所有字段（这就是「标准表单」应该有的列）        ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('【A. 基础字段】列名写这些里的任意一个都认（放在一行表头即可）\n');
const byField = {};
Object.entries(A.SMARTSHEET_FIELD_MAP).forEach(([k, v]) => { (byField[v] = byField[v] || []).push(k); });
const FIELD_CN = { name: '需求名', ddl: '截止日期', requester: '提需人', desc: '需求描述', needCopy: '是否要副本', copyInfo: '副本信息' };
Object.entries(byField).forEach(([v, ks]) => {
  console.log('  ' + (FIELD_CN[v] || v).padEnd(12) + '认这些列名：' + ks.join('、'));
});

console.log('\n【B. 需求类型】组名要含「需求类型/需求分类/需求大类」');
console.log('    三个大类各占一列，单元格里写子类名（写哪列 = 属于哪个大类）\n');
Object.keys(A.CATEGORY_TREE).forEach(big => {
  console.log('  列名【' + big + '】单元格可填：');
  Object.entries(A.CATEGORY_TREE[big]).forEach(([sub, id]) => {
    const al = (A.CATEGORY_SUB_ALIASES[big] || {})[id] || [sub];
    console.log('      ' + sub.padEnd(10) + '（也接受写成：' + al.filter(x => x !== sub).join('、') + '）');
  });
});

console.log('\n【C. 应用与露出】组名要含「应用与露出/需求应用/应用管线/露出管线」');
console.log('    单元格里写管线名，多个用逗号或换行分隔\n');
PIPES.forEach(p => {
  console.log('  ' + p.name.padEnd(12) + '（也接受「世界观' + p.name + '」这种带前缀的写法）');
});

console.log('\n【D. 已有产出】组名要含「已有产出/现有产出/已有资产/已有素材」');
console.log('    列名 = 二级分类，单元格里写具体项名（多个用逗号分隔）\n');
Object.keys(A.ASSETS_TREE).forEach(big => {
  console.log('  ── ' + big + ' ──');
  Object.entries(A.ASSETS_TREE[big]).forEach(([mid, items]) => {
    console.log('  列名【' + mid + '】可填：' + items.join('、'));
  });
});

console.log('\n【E. 特殊产出需求】组名要含「特殊产出/选做产出/额外产出/特殊需求」');
console.log('    列名和可填项与 D 完全一样，靠组名区分「已经有」还是「要新做」');
console.log('    列名也可以带「需求」后缀，如「Bible设定需求」\n');

console.log('注：单元格写「√ / 是 / 有 / 1」这种勾选标记也认，表示该分类整组都有。\n');

// ============ 第二部分：对照你的表单 ============
// 优先用命令行传的路径，否则找几个常见位置
const argFile = process.argv[2];
const SAMPLES = (argFile ? [argFile] : [
  path.join(__dirname, '世界观需求录入表单.xlsx'),
  path.join(__dirname, '..', '世界观需求录入表单.xlsx'),
  path.join(process.env.USERPROFILE || process.env.HOME || '', 'Desktop', '世界观需求录入表单.xlsx')
]).filter(p => p && fs.existsSync(p));

if (!SAMPLES.length) {
  console.log('\n───────────────────────────────────────────────');
  console.log('要对照具体表单，把 xlsx 路径当参数传进来：');
  console.log('  node 表单字段自检.js "C:\\路径\\我的表单.xlsx"');
  console.log('───────────────────────────────────────────────');
  process.exit(0);
}
const SAMPLE = SAMPLES[0];

const wb = XLSX.read(new Uint8Array(fs.readFileSync(SAMPLE)), { type: 'array', cellDates: true });
let best = null;
wb.SheetNames.forEach(nm => {
  const ws = wb.Sheets[nm]; if (!ws) return;
  const a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
  const ne = a.filter(r => r.some(c => String(c).trim()));
  if (!best || ne.length > best.length) best = ne;
});
let lastUsed = -1;
best.forEach(r => { for (let i = r.length - 1; i >= 0; i--) if (String(r[i]).trim()) { if (i > lastUsed) lastUsed = i; break; } });
const W = lastUsed + 1;
const table = best.map(r => { const o = r.slice(0, W).map(A.xlsxCellToText); while (o.length < W) o.push(''); return o; });

const layout = A.detectSmartsheetLayout(table);
const plan = A.buildSmartsheetPlan(table, layout);
const groupRow = layout.groupIdx >= 0 ? (table[layout.groupIdx] || []) : [];
const fieldRow = table[layout.fieldIdx] || [];

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  对照你桌面上那份表单，系统逐列认成了什么                    ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log('文件：' + SAMPLE);
console.log('组名行=第' + (layout.groupIdx + 1) + '行　字段行=第' + (layout.fieldIdx + 1) + '行　数据从第' + (layout.dataIdx + 1) + '行起');
console.log(W + ' 列 / ' + (table.length - layout.dataIdx) + ' 条需求\n');

const KIND_CN = { direct: '基础字段', category: '需求类型', pipelines: '应用与露出', assets: '已有产出', special: '特殊产出需求' };
console.log('列 你的列名              你的组名          →  系统认成        细节');
console.log('─'.repeat(88));
let curG = '', unknown = [];
for (let j = 0; j < W; j++) {
  const g = A.normSmartsheetCell(groupRow[j]); if (g) curG = g;
  const f = String(fieldRow[j] || '').trim();
  const p = plan[j];
  let kind = '（忽略）', note = '';
  if (p) {
    kind = KIND_CN[p.kind] || p.kind;
    if (p.kind === 'direct') note = FIELD_CN[p.field] || p.field;
    else if (p.kind === 'category') note = '大类=' + p.big;
    else if (p.kind === 'pipelines') note = '单元格填管线名';
    else note = (p.big || '?') + (p.mid ? '/' + p.mid : '');
  } else if (A.SMARTSHEET_JUNK_FIELD.test(A.normSmartsheetKey(f))) {
    note = '智能表格默认字段名，已过滤';
  } else if (!f) { note = '空列'; }
  else { note = '⚠ 认不出来'; unknown.push('第' + (j + 1) + '列「' + f + '」'); }
  console.log(String(j + 1).padEnd(3) + f.slice(0, 20).padEnd(22) + (curG || '-').slice(0, 16).padEnd(18) + '→  ' + kind.padEnd(15) + note);
}

console.log('\n───── 结论 ─────');
console.log(unknown.length ? '⚠ 有认不出来的列：' + unknown.join('、') : '✅ 所有有效列都被正确识别，没有漏认的');

// 缺哪些标准列
console.log('\n【你的表单缺了哪些系统支持的列】（缺了不报错，只是那类信息收不到）');
Object.keys(A.CATEGORY_TREE).forEach(big => {
  if (!plan.some(p => p && p.kind === 'category' && p.big === big)) console.log('  · 需求类型：' + big);
});
Object.keys(A.ASSETS_TREE).forEach(big => {
  Object.keys(A.ASSETS_TREE[big]).forEach(mid => {
    if (!plan.some(p => p && p.kind === 'assets' && p.mid === mid)) console.log('  · 已有产出：' + big + '/' + mid);
    if (!plan.some(p => p && p.kind === 'special' && p.mid === mid)) console.log('  · 特殊产出：' + big + '/' + mid);
  });
});
['name', 'ddl', 'requester', 'desc', 'needCopy', 'copyInfo'].forEach(fd => {
  if (!plan.some(p => p && p.kind === 'direct' && p.field === fd)) console.log('  · 基础字段：' + (FIELD_CN[fd] || fd));
});

// 实际解析结果
console.log('\n【实际解析出来的每条需求】');
const recs = A.parseSmartsheetTable(table);
recs.forEach((r, i) => {
  const cat = A.resolveCategory(r.bigCategory, r.subScene, r.subChar, r.subLit);
  console.log('\n  ' + (i + 1) + '. ' + r.name);
  console.log('     分类   ' + (r.bigCategory || '-') + ' / ' + (r.subScene || r.subChar || r.subLit || '-') + '  →  ' + cat);
  console.log('     管线   ' + JSON.stringify(A.resolvePipelineIds(r.pipelines || [])));
  console.log('     DDL    ' + (r.ddl || '-') + '   提需人 ' + (r.requester || '-'));
  console.log('     已有   文学' + JSON.stringify(r.assetsLitItem || []) + ' 美术' + JSON.stringify(r.assetsArtItem || []));
  console.log('     特殊   ' + JSON.stringify(r.specialItems || []));
});
