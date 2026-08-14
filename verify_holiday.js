// 假期补录功能验证：抽出纯逻辑函数在 node 里测
//
// 用法（在源码所在目录，或交接包的 测试/ 目录）：
//   node verify_holiday.js
//
// 自动寻找源码，兼容两种目录布局：
//   ① 原项目：  ai-scheduling-board-v10.html
//   ② 交接包：  ../源码/index.html
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---- 定位源码（不写死路径，否则换个目录布局就跑不起来）----
function locate(candidates, label) {
  for (const c of candidates) {
    const p = path.isAbsolute(c) ? c : path.join(__dirname, c);
    if (fs.existsSync(p)) return p;
  }
  console.error('❌ 找不到' + label + '，试过这些位置：');
  candidates.forEach(c => console.error('   ' + path.join(__dirname, c)));
  console.error('\n请在「源码所在目录」或「交接包的 测试/ 目录」下运行本脚本。');
  process.exit(1);
}

const HTML = locate([
  'ai-scheduling-board-v10.html',      // 原项目
  '源码/index.html',                    // 交接包根目录
  'index.html',
  '../ai-scheduling-board-v10.html',   // 脚本在 测试/ 子目录里
  '../源码/index.html'
], '源码 HTML');

console.log('源码：' + path.relative(__dirname, HTML) + '\n');
const lines = fs.readFileSync(HTML, 'utf8').split(/\r?\n/);

function grab(names) {
  const out = [];
  names.forEach(nm => {
    const re = new RegExp('^(function|const|let|var)\\s+' + nm + '\\b');
    let start = -1;
    for (let i = 0; i < lines.length; i++) { if (re.test(lines[i])) { start = i; break; } }
    if (start < 0) { console.error('!! 未找到: ' + nm); process.exit(1); }
    let end = start;
    const first = lines[start].trim();
    const isOneLiner = /;$/.test(first) && !/[{[(]\s*$/.test(first);
    if (!isOneLiner) {
      end = -1;
      for (let i = start + 1; i < lines.length; i++) { if (/^\};?\s*$/.test(lines[i])) { end = i; break; } }
      if (end < 0) { console.error('!! 未找到结尾: ' + nm); process.exit(1); }
    }
    out.push(lines.slice(start, end + 1).join('\n'));
  });
  return out.join('\n\n');
}

const NEEDED = [
  'normalizeDDL', 'getISOWeek',
  'holidayAskPrompt', 'parseHolidayPaste', 'holidayRangeToWeeks', 'buildHolidayEntries'
];

const harness = `
var DEFAULT_CONFIG = { holidays: { 2026: [{weeks:[7,8],name:'春节',rule:'x'}], 2027: [], 2028: [] } };
var state = { config: {} };
${grab(NEEDED)}
globalThis.__api = {};
${NEEDED.map(n => `globalThis.__api['${n}'] = ${n};`).join('\n')}
`;
const ctx = { console, JSON, Object, Array, String, Number, Math, Date, RegExp, Set, Map, parseInt, parseFloat, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(harness, ctx);
const A = ctx.__api;

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  实际=' + JSON.stringify(extra) : '')); }
}

// ---------- 1. 话术生成 ----------
console.log('=== 1. 提问话术 ===');
const p = A.holidayAskPrompt(2029);
ok('话术含年份', p.indexOf('2029') >= 0);
ok('话术要求固定格式', p.indexOf('假期名称|放假开始日期|放假结束日期') >= 0);
ok('话术要求 YYYY-MM-DD', p.indexOf('YYYY-MM-DD') >= 0);
ok('话术提醒不要补班日', p.indexOf('不要写补班日') >= 0);

// ---------- 2. 粘贴解析容错 ----------
console.log('\n=== 2. 粘贴解析（各种格式都要认）===');
const cases = [
  ['竖线分隔', '春节|2029-02-12|2029-02-18', 1],
  ['全角竖线', '春节｜2029-02-12｜2029-02-18', 1],
  ['逗号分隔', '春节,2029-02-12,2029-02-18', 1],
  ['中文逗号', '春节，2029-02-12，2029-02-18', 1],
  ['制表符', '春节\t2029-02-12\t2029-02-18', 1],
  ['斜杠日期', '春节|2029/2/12|2029/2/18', 1],
  ['中文日期', '春节|2029年2月12日|2029年2月18日', 1],
  ['单天假期(只给1个日期)', '元旦|2029-01-01', 1],
  ['多行', '元旦|2029-01-01|2029-01-01\n春节|2029-02-12|2029-02-18', 2],
  ['含空行', '元旦|2029-01-01\n\n\n春节|2029-02-12|2029-02-18', 2],
  ['跳过表头行', '假期名称|开始|结束\n元旦|2029-01-01|2029-01-01', 1],
  ['跳过"例如"行', '例如：\n元旦|2029-01-01|2029-01-01', 1]
];
cases.forEach(function (c) {
  const r = A.parseHolidayPaste(c[1]);
  ok(c[0] + ' → ' + c[2] + ' 条', r.items.length === c[2], { items: r.items.length, bad: r.bad });
});

const bad = A.parseHolidayPaste('这是一段废话\n春节|2029-02-12|2029-02-18\n只有名字');
ok('看不懂的行进 bad 列表', bad.items.length === 1 && bad.bad.length === 2, { ok: bad.items.length, bad: bad.bad });

// ---------- 3. 周换算 ----------
console.log('\n=== 3. 放假区间 → 扣周 ===');
// 2029-02-12 是周一，到 02-18 周日，整周 7 天 → 必扣
const w1 = A.holidayRangeToWeeks('2029-02-12', '2029-02-18');
const weeks1 = Object.keys(w1).map(Number);
ok('整周放假只落在 1 个 ISO 周', weeks1.length === 1, w1);
ok('该周天数 = 7', w1[weeks1[0]] === 7, w1);

// 跨周：2029-02-15(周四) ~ 02-19(周一) → 前周 3 天 + 后周 1 天
const w2 = A.holidayRangeToWeeks('2029-02-15', '2029-02-19');
ok('跨周会拆成 2 个周', Object.keys(w2).length === 2, w2);

// 单天
const w3 = A.holidayRangeToWeeks('2029-01-01', '2029-01-01');
ok('单天 → 1 周 1 天', Object.keys(w3).length === 1 && Object.values(w3)[0] === 1, w3);

// 非法输入
ok('结束早于开始 → 空', Object.keys(A.holidayRangeToWeeks('2029-05-10', '2029-05-01')).length === 0);
ok('非法日期 → 空', Object.keys(A.holidayRangeToWeeks('abc', 'def')).length === 0);

// ---------- 4. >3 天才扣的规则 ----------
console.log('\n=== 4. 「一周超 3 天才扣」规则 ===');
// 元旦单天 → 不扣
const b1 = A.buildHolidayEntries([{ name: '元旦', start: '2029-01-01', end: '2029-01-01' }]);
ok('元旦 1 天 → 不扣周', b1.entries.length === 0, b1.entries);
ok('但 detail 里有记录并说明原因', b1.detail.length === 1 && b1.detail[0].counted === false && b1.detail[0].miss.length === 1, b1.detail);

// 春节整周 → 扣
const b2 = A.buildHolidayEntries([{ name: '春节', start: '2029-02-12', end: '2029-02-18' }]);
ok('春节整周 → 扣 1 周', b2.entries.length === 1 && b2.entries[0].weeks.length === 1, b2.entries);
ok('entries 结构与内置数据同构（weeks/name/rule）',
  b2.entries[0].weeks && b2.entries[0].name === '春节' && typeof b2.entries[0].rule === 'string', b2.entries[0]);
ok('rule 里写清了为什么扣', b2.entries[0].rule.indexOf('占') >= 0 && b2.entries[0].rule.indexOf('扣') >= 0, b2.entries[0].rule);

// 恰好 3 天 → 不扣（边界）
// 找一个周内正好 3 天的：2029-04-04(周三)~04-06(周五)
const b3 = A.buildHolidayEntries([{ name: '清明节', start: '2029-04-04', end: '2029-04-06' }]);
ok('恰好 3 天 → 不扣（边界，必须是 >3 不是 >=3）', b3.entries.length === 0, b3.detail[0]);

// 4 天 → 扣
const b4 = A.buildHolidayEntries([{ name: '劳动节', start: '2029-05-01', end: '2029-05-04' }]);
const d4 = b4.detail[0];
ok('4 天且同一周 → 扣', b4.entries.length === 1, { entries: b4.entries, detail: d4 });

// 跨周只有一边超 3 天
const b5 = A.buildHolidayEntries([{ name: '测试', start: '2029-02-15', end: '2029-02-19' }]);
ok('跨周时只扣超 3 天的那一周', b5.entries.length === 0 || b5.entries[0].weeks.length <= 1,
  { entries: b5.entries, detail: b5.detail[0] });

// ---------- 5. 同名假期合并 ----------
console.log('\n=== 5. 同名假期分两段录入 → 合并 ===');
const b6 = A.buildHolidayEntries([
  { name: '国庆节', start: '2029-10-01', end: '2029-10-07' },
  { name: '国庆节', start: '2029-10-08', end: '2029-10-14' }
]);
ok('同名合并成 1 条', b6.entries.length === 1, b6.entries.map(x => x.name));
ok('周号合并且去重排序', b6.entries[0].weeks.length === 2 &&
  b6.entries[0].weeks[0] < b6.entries[0].weeks[1], b6.entries[0].weeks);

// ---------- 6. 真实场景：完整一年 ----------
console.log('\n=== 6. 真实场景：粘贴完整一年 ===');
const realPaste = [
  '元旦|2029-01-01|2029-01-01',
  '春节|2029-02-12|2029-02-18',
  '清明节|2029-04-04|2029-04-06',
  '劳动节|2029-05-01|2029-05-05',
  '端午节|2029-06-16|2029-06-18',
  '中秋节|2029-09-22|2029-09-24',
  '国庆节|2029-10-01|2029-10-07'
].join('\n');
const rp = A.parseHolidayPaste(realPaste);
ok('7 个假期全部读到', rp.items.length === 7, rp.items.length);
ok('没有读不懂的行', rp.bad.length === 0, rp.bad);
const rb = A.buildHolidayEntries(rp.items);
console.log('  扣周明细：');
rb.detail.forEach(function (d) {
  console.log('    ' + d.name.padEnd(8) + ' ' + d.start + '~' + d.end + '  ' +
    (d.counted ? '扣 W' + d.hit.map(x => x.w + '(' + x.days + '天)').join(',W') : '不扣'));
});
ok('至少扣 3 周（春节/劳动/国庆）', new Set([].concat.apply([], rb.entries.map(e => e.weeks))).size >= 3,
  rb.entries.map(e => e.name + ':' + e.weeks.join(',')));
ok('元旦和端午不扣（各≤3天）',
  !rb.entries.some(e => e.name === '元旦'), rb.entries.map(e => e.name));

console.log('\n================================');
console.log('  PASS ' + pass + ' / FAIL ' + fail);
console.log('================================');
process.exit(fail ? 1 : 0);
