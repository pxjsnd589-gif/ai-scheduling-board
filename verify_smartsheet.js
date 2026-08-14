// v75 验证：智能表格解析链路端到端实测
//
// 用法（在源码所在目录，或交接包根目录）：
//   node verify_smartsheet.js
//
// 自动寻找源码与依赖，兼容两种目录布局：
//   ① 原项目：  ai-scheduling-board-v10.html + xlsx-js-style.min.js 同目录
//   ② 交接包：  源码/index.html + 源码/xlsx-js-style.min.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 定位源码与依赖（不写死路径，否则换个目录布局就跑不起来）----
function locate(candidates, label) {
  for (const c of candidates) {
    const p = path.isAbsolute(c) ? c : path.join(__dirname, c);
    if (fs.existsSync(p)) return p;
  }
  console.error('❌ 找不到' + label + '，试过这些位置：');
  candidates.forEach(c => console.error('   ' + path.join(__dirname, c)));
  console.error('\n请在「源码所在目录」或「交接包根目录」下运行本脚本。');
  process.exit(1);
}

const HTML_PATH = locate([
  'ai-scheduling-board-v10.html',      // 原项目
  '源码/index.html',                    // 交接包
  'index.html',                        // 直接放一起
  '../ai-scheduling-board-v10.html',   // 脚本在 测试/ 子目录里
  '../源码/index.html'
], '源码 HTML');

const XLSX_PATH = locate([
  'xlsx-js-style.min.js',
  '源码/xlsx-js-style.min.js',
  '../xlsx-js-style.min.js',
  '../源码/xlsx-js-style.min.js'
], 'xlsx-js-style.min.js');

console.log('源码：' + path.relative(__dirname, HTML_PATH));
console.log('依赖：' + path.relative(__dirname, XLSX_PATH) + '\n');

const xcode = fs.readFileSync(XLSX_PATH, 'utf8');
const sbx = { window: {}, console, Uint8Array, ArrayBuffer, Date, Math, JSON, String, Number, Array, Object, RegExp, Error, TextDecoder, TextEncoder, parseInt, parseFloat, isNaN, Set, Map };
sbx.self = sbx.window; sbx.globalThis = sbx;
vm.createContext(sbx); vm.runInContext(xcode, sbx);
const XLSX = sbx.XLSX || sbx.window.XLSX;

const html = fs.readFileSync(HTML_PATH, 'utf8');
const lines = html.split(/\r?\n/);

// 按函数名抓取源码块。
// 结尾判据用「顶层闭合行」而不是括号配平——因为正则/字符串里含大量 {} ()，配平必错。
// 本文件所有目标声明都是顶格书写、以顶格的 } 或 }; 结束。
function grab(names) {
  const out = [];
  names.forEach(nm => {
    const re = new RegExp('^(function|const|let|var)\\s+' + nm + '\\b');
    let start = -1;
    for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { start = i; break; } }
    if (start < 0) { console.error('!! 未找到声明: ' + nm); process.exit(1); }
    let end = start;
    const first = lines[start].trim();
    // 单行声明：const X = /regex/;  或  const X = {...};
    const isOneLiner = /;$/.test(first) && !/[{[(]\s*$/.test(first);
    if (!isOneLiner) {
      end = -1;
      for (let i = start + 1; i < lines.length; i++) {
        if (/^\};?\s*$/.test(lines[i])) { end = i; break; }
      }
      if (end < 0) { console.error('!! 未找到结尾: ' + nm); process.exit(1); }
    }
    out.push(lines.slice(start, end + 1).join('\n'));
  });
  return out.join('\n\n');
}

const NEEDED = [
  'ASSETS_TREE', 'MIDS_WITH_ORDER', 'CATEGORY_TREE', 'CATEGORY_SUB_ALIASES', 'resolveSubCategoryId', 'canonicalSubName',
  'tableToTabText', 'QUESTIONNAIRE_HEADER_MAP', 'normalizeHeader', 'stripMatrixPrefix',
  'splitMulti', 'splitAssets', 'resolveCategory', 'resolvePipelineId', 'resolvePipelineIds',
  'expandAssetTokens', 'detectQuestionnaireFormat', 'extractBracketItem', 'extractColonSuffix',
  'parseCopyInfo', 'normalizeDDL', 'parseQuestionnaireMultiCol', 'parseSimple', 'parseTextToTable',
  // v75 新增
  'SMARTSHEET_FIELD_MAP', 'SMARTSHEET_EMPTY', 'SMARTSHEET_CHECKED', 'SMARTSHEET_JUNK_FIELD',
  'normSmartsheetCell', 'normSmartsheetKey', 'splitSmartsheetMulti', 'smartsheetGroupKind',
  'findAssetMid', 'findBigOfAssetItem', 'isStrictPipelineName', 'sniffColumnKind', 'resolveSubCategory',
  'detectSmartsheetLayout', 'buildSmartsheetPlan',
  'parseSmartsheetTable', 'expandRecordCopies', 'detectImportFormat'
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
vm.createContext(ctx);
vm.runInContext(harness, ctx);
const A = ctx.__api;

// ---- 复刻 readXlsxFile ----
function xlsxCellToText(c) {
  if (c == null) return '';
  if (c instanceof Date && !isNaN(c)) {
    const r = new Date(Math.round(c.getTime() / 86400000) * 86400000);
    const p = n => (n < 10 ? '0' + n : '' + n);
    return r.getUTCFullYear() + '-' + p(r.getUTCMonth() + 1) + '-' + p(r.getUTCDate());
  }
  return String(c).replace(/\r/g, '').trim();
}
function readXlsx(path) {
  const wb = XLSX.read(new Uint8Array(fs.readFileSync(path)), { type: 'array', cellDates: true });
  let best = null;
  wb.SheetNames.forEach(nm => {
    const ws = wb.Sheets[nm]; if (!ws) return;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true, blankrows: false });
    const ne = aoa.filter(r => r.some(c => String(c).trim()));
    if (!best || ne.length > best.rows.length) best = { name: nm, rows: ne };
  });
  let aoa = best.rows;
  let lastUsed = -1;
  aoa.forEach(r => { for (let i = r.length - 1; i >= 0; i--) { if (String(r[i]).trim()) { if (i > lastUsed) lastUsed = i; break; } } });
  if (lastUsed >= 0) {
    const width = lastUsed + 1;
    aoa = aoa.map(r => { const o = r.slice(0, width); while (o.length < width) o.push(''); return o; });
  }
  return { header: aoa[0].map(h => String(h == null ? '' : h).trim()), rows: aoa.slice(1).map(r => r.map(xlsxCellToText)) };
}

let pass = 0, fail = 0;
let skipped = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  实际=' + JSON.stringify(extra) : '')); }
}

// 真实样例文件是可选的：它在我本机桌面上，交接给别人后不一定存在。
// 找不到就跳过依赖它的两个用例，其余 80+ 项断言（构造数据）照常跑。
const SAMPLE = (function () {
  const cands = [
    path.join(__dirname, '世界观需求录入表单.xlsx'),
    path.join(__dirname, '样例', '世界观需求录入表单.xlsx'),
    path.join(__dirname, '..', '世界观需求录入表单.xlsx'),
    'C:/Users/ppxjpeng/Desktop/世界观需求录入表单.xlsx'
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
})();

if (!SAMPLE) {
  console.log('ℹ️  未找到真实样例文件「世界观需求录入表单.xlsx」，将跳过用例 1 和 8。');
  console.log('   其余用例用构造数据，覆盖同样的解析逻辑。');
  console.log('   想跑完整测试：把一份智能表格导出的 xlsx 放到脚本同目录，命名为上述名字。\n');
} else {
  console.log('样例：' + SAMPLE + '\n');
}

// ================= 用例 1：真实文件 =================
if (SAMPLE) {
console.log('\n===== 用例1：真实智能表格文件 =====');
const r = readXlsx(SAMPLE);
const tabText = A.tableToTabText(r.header, r.rows);
const fmt = A.detectImportFormat(tabText);
console.log('  格式探测 =', fmt);
ok('格式识别为 smartsheet', fmt === 'smartsheet', fmt);

const table = A.parseTextToTable(tabText).table;
const layout = A.detectSmartsheetLayout(table);
console.log('  layout =', JSON.stringify(layout));
ok('字段行 = 第2行(index 1)', layout && layout.fieldIdx === 1, layout);

const plan = A.buildSmartsheetPlan(table, layout);
console.log('\n  --- 列解析计划 ---');
plan.forEach((p, j) => {
  console.log('   col' + String(j).padStart(2) + ' ' + JSON.stringify(table[layout.fieldIdx][j] || '').padEnd(18) + ' → ' + (p ? JSON.stringify(p) : '(忽略)'));
});

const recs = A.parseSmartsheetTable(table);
console.log('\n  --- 解析结果 ---');
console.log(JSON.stringify(recs, null, 2));

const rec = recs[0] || {};
// ⚠️ 这里只断言「第一行」的解析质量，不断言总行数 / 具体提需人 ——
//    参考样例文件会被用户不断追加新需求、换填写人，写死会让测试变成噪音。
//    行数与多行正确性由用例 8（真实文件端到端）负责。
ok('至少解析出 1 条', recs.length >= 1, recs.length);
ok('需求名正确', rec.name === '一只由楼阁与街巷组成的巨大机关手臂', rec.name);
ok('大分类 = 场景类', rec.bigCategory === '场景类', rec.bigCategory);
ok('场景子类 = 剧情场景', rec.subScene === '剧情场景', rec.subScene);
ok('管线 = [PV]', JSON.stringify(rec.pipelines) === '["PV"]', rec.pipelines);
ok('DDL = 2026-11-13', rec.ddl === '2026-11-13', rec.ddl);
ok('提需人非空且含英文名', /^[a-zA-Z_]+\(/.test(rec.requester || ''), rec.requester);
ok('美术已有产出 = [印象图]', JSON.stringify(rec.assetsArtItem) === '["印象图"]', rec.assetsArtItem);
ok('无文学已有产出', !rec.assetsLitItem, rec.assetsLitItem);
ok('无特殊产出需求', !rec.specialItems, rec.specialItems);
ok('脏列"单选/多选"未污染', !/单选|多选/.test(JSON.stringify(rec)), rec);

// 下游一致性
const catId = A.resolveCategory(rec.bigCategory, rec.subScene, rec.subChar, rec.subLit);
ok('分类映射 → scene-story', catId === 'scene-story', catId);
const pipeIds = A.resolvePipelineIds(rec.pipelines || []);
ok('管线映射 → [pv]', JSON.stringify(pipeIds) === '["pv"]', pipeIds);
const assets = A.expandAssetTokens(rec.assetsArtItem || []);
ok('产出展开 = [印象图]', JSON.stringify(assets) === '["印象图"]', assets);
} else { skipped += 1; }

// ================= 用例 2：多行 + 多选 + 特殊需求 =================
console.log('\n===== 用例2：多行/多选/特殊需求/文学产出 =====');
const t2 = [
  ['', '需求类型（若无某类需求可不选该类选项）', '', '', '需求应用与露出（若无某类需求可不选该类选项）', '已有产出：文学', '', '', '', '已有产出：美术', '', '特殊产出需求', '', '', '', '', ''],
  ['需求名', '场景类', '角色类', '纯文学类', '局内', 'Bible设定', '叙事设计', '物料应用', '角色设定', '角色原画', '场景原画', 'Bible设定需求', '场景原画需求', '角色设定需求', '物料应用需求', 'DDL', '提需人'],
  ['星港的黎明', '世界观场景', '', '', 'CG,PV', '', '', '', '', '', '概念图', '天文地理设定,历法节日', '', '', '道具设定', '2026/9/30', '张三'],
  ['无名剑客', '', '重点NPC', '', '英雄线', '', '', '', '重点NPC角色卡', '设定图', '', '', '', '', '', '2026年12月1日', '李四'],
  ['历法体系补完', '', '', '简单补充设定', 'Bible概念', '历法节日', '', '', '', '无', '无', '世界特点总述', '', '', '', '2027-01-15', '王五']
];
ok('用例2 识别为 smartsheet', !!A.detectSmartsheetLayout(t2));
const rs2 = A.parseSmartsheetTable(t2);
console.log(JSON.stringify(rs2, null, 2));
ok('解析出 3 条', rs2.length === 3, rs2.length);

const [a, b, c] = rs2;
ok('#1 分类 世界观场景', a.bigCategory === '场景类' && a.subScene === '世界观场景', [a.bigCategory, a.subScene]);
ok('#1 管线 CG+PV', JSON.stringify(a.pipelines) === '["CG","PV"]', a.pipelines);
ok('#1 美术产出 概念图', JSON.stringify(a.assetsArtItem) === '["概念图"]', a.assetsArtItem);
ok('#1 特殊需求 3 项', JSON.stringify(a.specialItems) === '["天文地理设定","历法节日","道具设定"]', a.specialItems);
ok('#1 DDL 归一 2026-09-30', a.ddl === '2026-09-30', a.ddl);

ok('#2 分类 角色类/重点NPC', b.bigCategory === '角色类' && b.subChar === '重点NPC', [b.bigCategory, b.subChar]);
ok('#2 文学产出 重点NPC角色卡', JSON.stringify(b.assetsLitItem) === '["重点NPC角色卡"]', b.assetsLitItem);
ok('#2 美术产出 设定图', JSON.stringify(b.assetsArtItem) === '["设定图"]', b.assetsArtItem);
ok('#2 DDL 归一 2026-12-01', b.ddl === '2026-12-01', b.ddl);
ok('#2 分类映射 char-key', A.resolveCategory(b.bigCategory, b.subScene, b.subChar, b.subLit) === 'char-key');

ok('#3 分类 纯文学类/简单补充设定', c.bigCategory === '纯文学类' && c.subLit === '简单补充设定', [c.bigCategory, c.subLit]);
ok('#3 文学产出 历法节日', JSON.stringify(c.assetsLitItem) === '["历法节日"]', c.assetsLitItem);
ok('#3 "无" 不进产出', !c.assetsArtItem, c.assetsArtItem);
ok('#3 特殊需求 世界特点总述', JSON.stringify(c.specialItems) === '["世界特点总述"]', c.specialItems);
ok('#3 管线 Bible概念', JSON.stringify(c.pipelines) === '["Bible概念"]', c.pipelines);

// ================= 用例 3：不能误伤腾讯问卷老格式 =================
console.log('\n===== 用例3：腾讯问卷老格式回归 =====');
const qHeader = ['1.需求名称', '2.需求分类', '3.场景子分类', '6.需求应用与露出矩阵:PV', '9.文学已有产出具体项:[Bible设定] 历法节日', '13.DDL', '16.提需人'];
const qRows = [['古城遗迹', '场景类', '剧情场景', 'A.PV', '√', '2026-10-01', '赵六']];
const qText = A.tableToTabText(qHeader, qRows);
const qFmt = A.detectImportFormat(qText);
ok('问卷格式仍判定 multi-col', qFmt === 'multi-col', qFmt);
const qTable = A.parseTextToTable(qText).table;
ok('问卷不会被误判成 smartsheet', A.detectSmartsheetLayout(qTable) === null);
const qRecs = A.parseQuestionnaireMultiCol(qText);
ok('问卷仍能解析出记录', qRecs.length === 1 && qRecs[0].name === '古城遗迹', qRecs);
ok('问卷 DDL 正常', qRecs[0] && qRecs[0].ddl === '2026-10-01', qRecs[0] && qRecs[0].ddl);
ok('问卷 提需人正常', qRecs[0] && qRecs[0].requester === '赵六', qRecs[0] && qRecs[0].requester);

// ================= 用例 4：单行表头（无组名行）容错 =================
console.log('\n===== 用例4：单行表头容错 =====');
const t4 = [
  ['需求名', 'DDL', '提需人', '场景类', '局内', '角色原画'],
  ['测试需求', '2026-08-08', '孙七', '剧情场景', 'CG', '印象图']
];
const l4 = A.detectSmartsheetLayout(t4);
ok('单行表头也能识别', !!l4, l4);
const rs4 = A.parseSmartsheetTable(t4);
console.log(JSON.stringify(rs4));
ok('单行表头 解析 1 条', rs4.length === 1, rs4.length);
ok('单行表头 需求名正确', rs4[0] && rs4[0].name === '测试需求', rs4[0]);
ok('单行表头 DDL 正确', rs4[0] && rs4[0].ddl === '2026-08-08', rs4[0] && rs4[0].ddl);
ok('单行表头 分类正确', rs4[0] && rs4[0].subScene === '剧情场景', rs4[0] && rs4[0].subScene);
ok('单行表头 管线正确', rs4[0] && JSON.stringify(rs4[0].pipelines) === '["CG"]', rs4[0] && rs4[0].pipelines);
ok('单行表头 产出正确', rs4[0] && JSON.stringify(rs4[0].assetsArtItem) === '["印象图"]', rs4[0] && rs4[0].assetsArtItem);

// ================= 用例 5：勾选式单元格 =================
console.log('\n===== 用例5：勾选式单元格（列名即内容）=====');
const t5 = [
  ['', '需求应用与露出', '', '已有产出：美术', ''],
  ['需求名', 'CG', 'PV', '角色原画', '场景原画', 'DDL', '提需人'],
  ['勾选测试', '√', '是', '', '√', '2026-09-09', '周八']
];
const rs5 = A.parseSmartsheetTable(t5);
console.log(JSON.stringify(rs5));
ok('勾选式 管线 = CG+PV', rs5[0] && JSON.stringify(rs5[0].pipelines) === '["CG","PV"]', rs5[0] && rs5[0].pipelines);
ok('勾选式 产出 = 场景原画(整组)', rs5[0] && JSON.stringify(rs5[0].assetsArtItem) === '["场景原画"]', rs5[0] && rs5[0].assetsArtItem);
const exp5 = A.expandAssetTokens(rs5[0].assetsArtItem);
ok('勾选式 整组展开为 4 项', exp5.length === 4, exp5);

// ================= 用例 6：需求副本 =================
console.log('\n===== 用例6：需求副本展开 =====');
const t6 = [
  ['', '需求类型', '', '', ''],
  ['需求名', '场景类', '局内', 'DDL', '提需人', '是否需要添加需求副本', '需求副本信息'],
  ['主需求A', '剧情场景', 'CG', '2026-10-10', '吴九', '是，需要添加副本', '副本1,2026-11-11;副本2,2026-12-12']
];
const rs6 = A.parseSmartsheetTable(t6);
console.log(JSON.stringify(rs6.map(x => ({ name: x.name, ddl: x.ddl, copyOf: x._copyOf }))));
ok('副本展开为 3 条', rs6.length === 3, rs6.length);
ok('副本1 名称/DDL 正确', rs6[1] && rs6[1].name === '副本1' && rs6[1].ddl === '2026-11-11', rs6[1]);
ok('副本继承管线', rs6[1] && JSON.stringify(rs6[1].pipelines) === '["CG"]', rs6[1] && rs6[1].pipelines);

// ================= 用例 7：子分类别名（v75.1 回归）=================
// 背景 bug：CATEGORY_TREE 的 key 写的是「系统性设定」，而 UI 下拉/流程配置写的是
// 「系统文学设定」。智能表格填的是后者 → 查表失败 → 静默降级成 lit-simple。
// 现改为「别名表 + 长别名优先」匹配，并把 key 统一成规范名。
console.log('\n===== 用例7：子分类别名归一（含历史 bug 回归）=====');
const ALIAS_CASES = [
  ['纯文学类', '系统文学设定', 'lit-system'],
  ['纯文学类', '系统性设定', 'lit-system'],                  // 老 CATEGORY_TREE 写法
  ['纯文学类', '系统概念设定', 'lit-system'],
  ['纯文学类', '系统性设定（如：区域概念）', 'lit-system'],   // 问卷带括号说明
  ['纯文学类', '简单补充设定', 'lit-simple'],
  ['纯文学类', '补充设定', 'lit-simple'],
  ['场景类', '剧情场景', 'scene-story'],
  ['场景类', '世界观场景', 'scene-world'],
  ['角色类', '重点NPC', 'char-key'],
  ['角色类', 'NPC', 'char-normal'],
  ['角色类', '普通NPC', 'char-normal'],
  ['角色类', 'A.重点NPC', 'char-key']                        // 带选项前缀
];
ALIAS_CASES.forEach(function (cs) {
  const got = A.resolveSubCategoryId(cs[0], cs[1]);
  ok('别名 ' + cs[0] + '/' + cs[1] + ' → ' + cs[2], got === cs[2], got);
});
// 长别名优先：'重点NPC' 含 'NPC'，不按长度排序会错判成 char-normal
ok('长别名优先：重点NPC 不被 NPC 抢走', A.resolveSubCategoryId('角色类', '重点NPC') === 'char-key');
ok('resolveCategory 系统文学设定 → lit-system',
  A.resolveCategory('纯文学类', '', '', '系统文学设定') === 'lit-system',
  A.resolveCategory('纯文学类', '', '', '系统文学设定'));
ok('resolveCategory 缺大类也能靠子类判定',
  A.resolveCategory('', '', '', '系统文学设定') === 'lit-system',
  A.resolveCategory('', '', '', '系统文学设定'));
ok('canonicalSubName 系统性设定 → 系统文学设定',
  A.canonicalSubName('纯文学类', '系统性设定') === '系统文学设定',
  A.canonicalSubName('纯文学类', '系统性设定'));
ok('CATEGORY_TREE 纯文学类 key 已统一为 系统文学设定',
  Object.keys(A.CATEGORY_TREE['纯文学类']).indexOf('系统文学设定') >= 0,
  Object.keys(A.CATEGORY_TREE['纯文学类']));

// ================= 用例 8：真实 5 行文件（含径山书院）=================
if (SAMPLE) {
console.log('\n===== 用例8：真实多行文件端到端 =====');
{
  const rr = readXlsx(SAMPLE);
  const tt = A.parseTextToTable(A.tableToTabText(rr.header, rr.rows)).table;
  const rs = A.parseSmartsheetTable(tt);
  console.log('  解析 ' + rs.length + ' 条：' + rs.map(x => x.name).join(' / '));
  const lit = rs.find(x => x.name && x.name.indexOf('径山书院') >= 0);
  if (lit) {
    const cid = A.resolveCategory(lit.bigCategory, lit.subScene, lit.subChar, lit.subLit);
    ok('径山书院 大分类 = 纯文学类', lit.bigCategory === '纯文学类', lit.bigCategory);
    ok('径山书院 子类归一为 系统文学设定', lit.subLit === '系统文学设定', lit.subLit);
    ok('径山书院 → lit-system（不再误判 lit-simple / scene-story）', cid === 'lit-system', cid);
    ok('径山书院 管线 = bible+region',
      JSON.stringify(A.resolvePipelineIds(lit.pipelines || [])) === '["bible","region"]',
      A.resolvePipelineIds(lit.pipelines || []));
    ok('径山书院 特殊需求 = 文明设定（与关系）',
      JSON.stringify(lit.specialItems) === '["文明设定（与关系）"]', lit.specialItems);
    ok('径山书院 DDL = 2026-12-24', lit.ddl === '2026-12-24', lit.ddl);
    ok('带括号的产出项名未被截断', lit.specialItems && lit.specialItems[0] === '文明设定（与关系）', lit.specialItems);
  } else {
    ok('找到径山书院这条记录', false, rs.map(x => x.name));
  }
  const others = rs.filter(x => x.name && x.name.indexOf('径山书院') < 0);
  ok('其余 4 条仍为 scene-story',
    others.length === 4 && others.every(x => A.resolveCategory(x.bigCategory, x.subScene, x.subChar, x.subLit) === 'scene-story'),
    others.map(x => [x.name, A.resolveCategory(x.bigCategory, x.subScene, x.subChar, x.subLit)]));

  // ★ 关键回归：「叙事设计」是产出物列名，但含子串「叙事」（管线名）。
  //   若用 resolvePipelineId（对单元格值故意做模糊子串匹配）来判列名，
  //   这一列会被当成管线列 → 该列填的已有产出（剧情设计）整列丢失。
  //   必须用 isStrictPipelineName（精确匹配 + 产出物名优先）。
  const ca = rs.find(x => x.name === '长安坍塌');
  if (ca) {
    ok('长安坍塌 已有产出含 剧情设计（「叙事设计」列未被误判成管线）',
      (ca.assetsLitItem || []).indexOf('剧情设计') >= 0, ca.assetsLitItem);
    ok('长安坍塌 管线仍只有 pv（未被产出列污染）',
      JSON.stringify(A.resolvePipelineIds(ca.pipelines || [])) === '["pv"]',
      A.resolvePipelineIds(ca.pipelines || []));
  } else {
    ok('找到长安坍塌这条记录', false, rs.map(x => x.name));
  }
}
} else { skipped += 1; }

// ================= 用例 8b：isStrictPipelineName 单元断言 =================
// 不依赖样例文件，独立跑。
// 背景：「叙事设计」是产出物，但含子串「叙事」（管线名）。
// 用 resolvePipelineId（模糊匹配）判列名会把它当管线列，该列产出全丢。
console.log('\n===== 用例8b：严格管线名判定 =====');
ok('isStrict: 叙事设计 → false（是产出物）', A.isStrictPipelineName('叙事设计') === false);
ok('isStrict: 叙事 → true', A.isStrictPipelineName('叙事') === true);
ok('isStrict: 世界观Bible概念 → true（去前缀后精确）', A.isStrictPipelineName('世界观Bible概念') === true);
ok('isStrict: 角色设定 → false（是产出物）', A.isStrictPipelineName('角色设定') === false);
ok('isStrict: 物料应用 → false（是产出物）', A.isStrictPipelineName('物料应用') === false);
ok('isStrict: 局内 → false（不是任何管线名）', A.isStrictPipelineName('局内') === false);

// ================= 用例 9：组名行错位/缺失也不能影响分类 =================
// 真实踩坑：skill 的 handleMessage 会 text.trim()，把首行开头的空列吃掉
// → 整个组名行左移一格 → 「纯文学类」列被组名判成 pipelines → 分类整列作废
// → 需求被兜底成 scene-story。修复思路：字段名能自证身份时优先于组名。
console.log('\n===== 用例9：组名行错位 / 缺失 / 全空 =====');
{
  const FIELD = ['需求名', '场景类', '角色类', '纯文学类', '局内', 'Bible设定', '角色原画', 'Bible设定需求', 'DDL', '提需人'];
  const DATA = ['径山书院概念刷新', '', '', '系统文学设定', '世界观Bible概念, 世界观区域概念', '', '', '文明设定（与关系）', '2026年12月24日', 'ppxjpeng(彭炫境)'];
  const GROUP_OK = ['', '需求类型', '', '', '需求应用与露出', '已有产出：文学', '已有产出：美术', '特殊产出需求', '', ''];

  const variants = [
    ['组名正常', GROUP_OK],
    ['组名左移一格（trim 吃掉前导空列）', GROUP_OK.slice(1).concat([''])],
    ['组名右移一格', [''].concat(GROUP_OK.slice(0, -1))],
    ['组名行全空', FIELD.map(() => '')],
    ['组名行比字段行短一半', GROUP_OK.slice(0, 5)]
  ];
  variants.forEach(function (v) {
    const label = v[0], groupRow = v[1];
    const t = [groupRow, FIELD, DATA];
    const rs = A.parseSmartsheetTable(t);
    const r = rs[0] || {};
    const cid = A.resolveCategory(r.bigCategory, r.subScene, r.subChar, r.subLit);
    ok('[' + label + '] 分类仍为 lit-system', cid === 'lit-system', cid + ' / subLit=' + r.subLit);
    ok('[' + label + '] 管线仍为 bible+region',
      JSON.stringify(A.resolvePipelineIds(r.pipelines || [])) === '["bible","region"]',
      A.resolvePipelineIds(r.pipelines || []));
    ok('[' + label + '] DDL 仍正确', r.ddl === '2026-12-24', r.ddl);
  });

  // 组名区分 assets vs special 的能力不能被破坏：
  // 「Bible设定」列（已有产出组）与「Bible设定需求」列（特殊产出组）语义不同
  const t = [GROUP_OK, FIELD, ['测试', '', '', '', '', '历法节日', '印象图', '世界特点总述', '2026-10-01', '甲']];
  const r = A.parseSmartsheetTable(t)[0] || {};
  ok('组名仍能区分 已有产出 vs 特殊产出（文学产出）',
    JSON.stringify(r.assetsLitItem) === '["历法节日"]', r.assetsLitItem);
  ok('组名仍能区分 已有产出 vs 特殊产出（美术产出）',
    JSON.stringify(r.assetsArtItem) === '["印象图"]', r.assetsArtItem);
  ok('组名仍能区分 已有产出 vs 特殊产出（特殊需求）',
    JSON.stringify(r.specialItems) === '["世界特点总述"]', r.specialItems);
}

console.log('\n================================');
console.log('  PASS ' + pass + ' / FAIL ' + fail +
  (skipped ? ' / 跳过 ' + skipped + ' 组（缺样例文件）' : ''));
console.log('================================');
if (skipped) {
  console.log('提示：把一份智能表格导出的 xlsx 命名为「世界观需求录入表单.xlsx」');
  console.log('      放到本脚本同目录，即可跑完整测试。');
}
process.exit(fail ? 1 : 0);
