/**
 * skill 同步核对 —— 网页版改了东西，skill 那份跟上了吗？
 * ============================================================================
 * 为什么要有这个脚本：
 *   网页版（ai-scheduling-board-v10.html）和 skill（~/.workbuddy/skills/ai-scheduling/）
 *   是两份独立实现，同一套规则各写一遍。历史上多次出现「网页版修好了、skill 还是老的」，
 *   而且 skill 那边不报错、只是结果不同，靠肉眼根本发现不了。
 *
 * 用法：
 *   node scripts/skill同步核对.js
 *
 * 退出码：0 全部同步；1 有未同步项（同时打印该改哪个文件）。
 *
 * 加新规则时：往下面 CHECKS 里加一条，写清「网页版在哪、skill 该在哪」。
 */
const fs = require('fs');
const path = require('path');

function locate(cands, label) {
  for (const c of cands) {
    const p = path.isAbsolute(c) ? c : path.join(__dirname, c);
    if (fs.existsSync(p)) return p;
  }
  console.error('❌ 找不到' + label + '，试过：');
  cands.forEach(c => console.error('   ' + path.join(__dirname, c)));
  return null;
}

// 兼容两种目录布局：原项目（scripts/ 下）与交接包（工具/ 下，源码在 ../源码/）
const WEB = locate([
  'ai-scheduling-board-v10.html',
  '../ai-scheduling-board-v10.html',
  '源码/index.html',
  '../源码/index.html',
  'index.html'
], '网页版源码');
const SKILL_DIR = [
  path.join(process.env.USERPROFILE || process.env.HOME || '', '.workbuddy', 'skills', 'ai-scheduling'),
  path.join(__dirname, '..', '..', '.workbuddy', 'skills', 'ai-scheduling')
].find(p => fs.existsSync(p));

if (!WEB) process.exit(1);
if (!SKILL_DIR) {
  console.log('⚠ 本机没装 ai-scheduling skill，跳过核对。');
  console.log('  skill 应在 ~/.workbuddy/skills/ai-scheduling/');
  process.exit(0);
}

const web = fs.readFileSync(WEB, 'utf8');
const S = {};
['parse_import.js', 'index.js', 'export-gantt.js', 'run_skill.js', 'read_xlsx.js', 'cli.js'].forEach(f => {
  const p = path.join(SKILL_DIR, f);
  S[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
});
const ALL = Object.values(S).join('\n');

let pass = 0, fail = 0;
const todo = [];
function ok(label, cond, fixHint) {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label); todo.push(label + '　→ ' + fixHint); }
}

// ---- 从网页版抓真值，逐项要求 skill 也有 ----
function pickObj(src, name) {
  const i = src.indexOf('const ' + name + ' = {');
  if (i < 0) return null;
  let d = 0, st = src.indexOf('{', i), e = -1;
  for (let k = st; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { e = k; break; } }
  }
  return e < 0 ? null : src.slice(st, e + 1).replace(/\s+/g, ' ');
}

console.log('网页版：' + path.relative(process.cwd(), WEB));
console.log('skill ：' + SKILL_DIR + '\n');

console.log('=== 1. 领域常量必须字节级一致 ===');
[
  ['CATEGORY_TREE', 'parse_import.js 与 index.js 两处都要改'],
  ['CATEGORY_SUB_ALIASES', 'parse_import.js'],
  ['ASSETS_TREE', 'index.js'],
  ['SMARTSHEET_FIELD_MAP', 'parse_import.js']
].forEach(([name, where]) => {
  const a = pickObj(web, name);
  const b = pickObj(ALL, name);
  ok(name + ' 一致', !!a && a === b, '把网页版的 ' + name + ' 原样复制到 skill 的 ' + where);
});

console.log('\n=== 2. 管线列表一致（名字/分值/审批人都算） ===');
function pipes(src) {
  return (src.match(/\{ id: '[a-z]+', name: '[^']+', score: \d+, importance: \d+, approver: '[^']*' \}/g) || [])
    .map(s => s.replace(/\s+/g, ' '));
}
const pw = pipes(web), ps = pipes(S['index.js']);
ok('管线条数一致（网页 ' + pw.length + ' / skill ' + ps.length + '）',
  pw.length === ps.length && pw.length >= 9, '同步 index.js 的 pipelines');
ok('管线内容逐条一致', JSON.stringify(pw) === JSON.stringify(ps),
  '同步 index.js 的 pipelines（含 score/importance/approver）');

console.log('\n=== 3. 关键函数必须存在于 skill ===');
[
  ['isStrictPipelineName', 'parse_import.js', '判列名要用严格匹配，别用 resolvePipelineId'],
  ['parseSmartsheetTable', 'parse_import.js', '智能表格解析主函数'],
  ['detectSmartsheetLayout', 'parse_import.js', '两行表头探测'],
  ['buildSmartsheetPlan', 'parse_import.js', '列语义判定（字段名>数据>组名）'],
  ['sniffColumnKind', 'parse_import.js', '值嗅探兜底'],
  ['resolveSubCategoryId', 'parse_import.js', '子分类别名归一（长别名优先）'],
  ['canonicalSubName', 'parse_import.js', '值归一到规范名'],
  ['holidayAskPrompt', 'index.js', '假期补录：问 AI 的话术'],
  ['parseHolidayPaste', 'index.js', '假期补录：解析粘贴文本'],
  ['buildHolidayEntries', 'index.js', '假期补录：算扣哪几周'],
  ['generateReqNames', 'index.js', '甘特图规范名称列'],
  ['litNodeToAsset', 'index.js', '文学节点取名']
].forEach(([fn, file, why]) => {
  ok(fn + '（' + why + '）', new RegExp('function\\s+' + fn + '\\b').test(ALL),
    '在 skill 的 ' + file + ' 里补上 ' + fn);
});

console.log('\n=== 4. 假期两层合并（v76） ===');
ok('网页版有 userHolidays', web.indexOf('userHolidays') >= 0, '—');
ok('skill index.js 有 userHolidays', S['index.js'].indexOf('userHolidays') >= 0,
  'index.js 的 _holidayCfg 要先查 cfg.userHolidays');
ok('skill 甘特图也走两层合并', S['export-gantt.js'].indexOf('userHolidays') >= 0,
  'export-gantt.js 的 _holidayCfg 也要查 userHolidays，否则导出的表跟排期不一致');
ok('configure 不冲掉 userHolidays', S['index.js'].indexOf('keepUserHolidays') >= 0,
  'configure() 重建 cfg 时要保留 userHolidays（对应网页版「版本升级不覆盖」）');
ok('甘特图假期表年份不写死', !/\[2026,\s*2027,\s*2028\]\.forEach/.test(S['export-gantt.js']),
  'export-gantt.js 的假期 Sheet 要用 allHolidayYears()，否则补录的年份不显示');

console.log('\n=== 5. 子分类规范名（v75.1 那个真实 bug） ===');
ok('网页版用规范名「系统文学设定」', web.indexOf("'系统文学设定': 'lit-system'") >= 0, '—');
ok('skill 也用规范名', ALL.indexOf("'系统文学设定': 'lit-system'") >= 0,
  'CATEGORY_TREE 的 key 必须是规范名，新写法只加进别名表');
ok('skill 无残留旧 key「系统性设定」', ALL.indexOf("'系统性设定': 'lit-system'") < 0,
  '把旧 key 挪进 CATEGORY_SUB_ALIASES，别留在 CATEGORY_TREE');

console.log('\n=== 6. 甘特图列结构 ===');
// 注意：这些常量是一条 `var C_NAME = 0, C_STD = 1, ...` 连写的，
// 所以只能按名字=数字来数，不能要求每个都带 var 前缀。
function ganttCols(src) {
  const out = {};
  (src.match(/C_(NAME|STD|PRIO|DDL|STATUS|FLOW|OWNER)\s*=\s*(\d+)/g) || []).forEach(s => {
    const m = s.match(/C_(\w+)\s*=\s*(\d+)/);
    if (m && !(m[1] in out)) out[m[1]] = +m[2];   // 取首次出现（定义处）
  });
  return out;
}
const gw = ganttCols(web), gs = ganttCols(S['export-gantt.js']);
ok('列索引常量齐全（' + Object.keys(gw).length + ' 个）', Object.keys(gw).length === 7, '—');
ok('列索引与网页版完全一致', JSON.stringify(gw) === JSON.stringify(gs),
  '加列时 skill 要同步改 4 处：LEFT、C_xxx 常量、st.cols 列宽、dataValidation.col。' +
  '网页=' + JSON.stringify(gw) + ' skill=' + JSON.stringify(gs));

console.log('\n=== 7. skill 自身能力（v76 新增） ===');
ok('describeFields 字段清单', /function\s+describeFields\b/.test(ALL),
  'parse_import.js 加 describeFields，从常量现读生成清单');
ok('diagnoseColumns 逐列诊断', /function\s+diagnoseColumns\b/.test(ALL),
  'parse_import.js 加 diagnoseColumns');
ok('read_xlsx 零依赖读取器', !!S['read_xlsx.js'], '加 read_xlsx.js（不能引 SheetJS，要维持零依赖）');
ok('cli 有 --fields', S['cli.js'].indexOf('--fields') >= 0, 'cli.js 加 --fields 分支');
ok('cli 有 --check-form', S['cli.js'].indexOf('--check-form') >= 0, 'cli.js 加 --check-form 分支');
ok('cli 有 --holiday', S['cli.js'].indexOf('--holiday') >= 0, 'cli.js 加 --holiday 分支');

console.log('\n' + '='.repeat(60));
console.log('  同步 ' + pass + ' 项 / 未同步 ' + fail + ' 项');
console.log('='.repeat(60));
if (fail) {
  console.log('\n要做的事：');
  todo.forEach(t => console.log('  · ' + t));
  console.log('\n改完记得跑：cd ' + SKILL_DIR + ' && node selftest.js');
} else {
  console.log('\nskill 与网页版一致。');
}
process.exit(fail ? 1 : 0);
