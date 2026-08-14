#!/usr/bin/env node
/**
 * ============================================================
 * 代码索引生成器（gen-code-index.js）
 * ------------------------------------------------------------
 * 为什么需要这个脚本：
 *   交接文档里写死行号（"autoSchedule 在 2041 行"）是个陷阱 ——
 *   代码一改行号就漂移，读文档的人跳过去看到的是别的东西，
 *   比没有行号更误导。实测 2026-08-14 时两份文档共 197 处行号全部失效。
 *
 *   解决办法：行号不写进文档，改成每次发布前跑一下这个脚本，
 *   自动生成 代码索引.md。文档里只写函数名，让读者查索引。
 *
 * 用法：
 *   node scripts/gen-code-index.js
 *   node scripts/gen-code-index.js --check     只校验不写文件（CI 用）
 *
 * 产出：
 *   代码索引.md   —— 按模块分组的「函数名 → 行号」表 + 关键常量位置
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const CHECK_ONLY = process.argv.includes('--check');

// 自动定位源码，兼容两种目录布局（否则换个目录就跑不起来）：
//   ① 原项目：脚本在 scripts/，源码在上一级 ai-scheduling-board-v10.html
//   ② 交接包：脚本在 工具/，源码在 ../源码/index.html
function locateSrc() {
  const cands = [
    '../ai-scheduling-board-v10.html',
    '../源码/index.html',
    './ai-scheduling-board-v10.html',
    './源码/index.html',
    '../index.html'
  ];
  for (const c of cands) {
    const p = path.resolve(__dirname, c);
    if (fs.existsSync(p)) return p;
  }
  console.error('❌ 找不到源码 HTML，试过：');
  cands.forEach(c => console.error('   ' + path.resolve(__dirname, c)));
  process.exit(1);
}

const SRC = locateSrc();
// 索引文件输出到源码所在目录，跟源码放一起最直观
const OUT = path.join(path.dirname(SRC), '代码索引.md');

const lines = fs.readFileSync(SRC, 'utf8').split(/\r?\n/);
console.log('源码：' + SRC);

// ---------- 模块划分：按「这个函数属于哪个关注点」分组 ----------
// 分组依据是维护场景，不是代码顺序 —— 维护者是带着"我要改 X"的问题来查的。
const GROUPS = [
  {
    name: '配置层（改规则先看这里）',
    note: '静态权威数据。改这里的结构必须把 _cfgVersion +1，否则用户浏览器旧缓存不更新。',
    patterns: [
      'DEFAULT_CONFIG', 'DEFAULT_ITEM_TIME', 'ASSETS_TREE', 'CATEGORY_TREE',
      'CATEGORY_SUB_ALIASES', 'PIPELINE_REQUIRED', 'PIPELINE_OPTIONAL',
      'MIDS_WITH_ORDER', 'STORAGE_KEY'
    ]
  },
  {
    name: '分类与子分类归一',
    note: '新增子分类写法只往 CATEGORY_SUB_ALIASES 加别名，永远不要改 CATEGORY_TREE 的 key。',
    patterns: [
      'resolveCategory', 'resolveSubCategoryId', 'canonicalSubName',
      'resolvePipelineId', 'resolvePipelineIds', 'isStrictPipelineName'
    ]
  },
  {
    name: '工时与产出物计算',
    note: '工期估算的源头。工时统一用 daysMin/daysMax 区间，排期取上限，下限仅标注。',
    patterns: [
      'getItemTime', 'nodeDays', 'nodeDaysRange', 'rangeText',
      'upgradeNodeDaysField', 'expandAssetTokens', 'getAssetPath',
      'findAssetMid', 'findBigOfAssetItem'
    ]
  },
  {
    name: '流程引擎',
    note: '排期链的第一环。取名逻辑的数据源必须用 expandedFlowNodes，别用 calculateRemaining（两套逻辑会漂移）。',
    patterns: [
      'expandedFlowNodes', 'calculateRemaining', 'buildLitNodes', 'litItemsForReq',
      'computeForcedLit', 'hasExistingLit', 'detectArtMids', 'nodeMakeRole',
      'artItemAllowedForCategory', 'nodeDisplayName'
    ]
  },
  {
    name: '决策链（分类→审批人→优先级）',
    note: '排期链第二环。优先分、重要分、档位判定、审批人推荐都在 runDecisionChain 里，是一整个大函数。',
    patterns: ['runDecisionChain', 'resolveReqReviewer', 'getPipeline', 'getPipeName']
  },
  {
    name: '排期引擎（核心算法）',
    note: 'review 节点锁 1 天并嵌入前一制作环节；节点名含「修改」「发包」会被判为嵌入节点，自定义环节取名要避开。',
    patterns: [
      'autoSchedule', 'batchSchedule', '_doBatchSchedule', 'resolveOwnerId',
      'pickSeat', 'roleSeatCount', '_recomputeSeatOccupancy', '_compactSeatDelayGap',
      '_stretchMakeBeforeMeeting', '_addWorkdays', '_nextWorkday', '_isWorkday',
      '_latestStartDate', 'isHolidayWeek', 'getHolidayWeeks', 'getISOWeek'
    ]
  },
  {
    name: '表格导入解析（问卷 / 智能表格）',
    note: '列语义判定优先级固定为「字段名 > 数据内容 > 组名」。组名最不可信，不要改回组名优先。',
    patterns: [
      'detectImportFormat', 'detectSmartsheetLayout', 'buildSmartsheetPlan',
      'parseSmartsheetTable', 'sniffColumnKind', 'resolveSubCategory',
      'detectQuestionnaireFormat', 'parseQuestionnaireMultiCol', 'parseSimple',
      'expandRecordCopies', 'readXlsxFile', 'readCsvFile', 'sniffFileKind',
      'detectTextEncoding', 'parseTextToTable', 'tableToTabText',
      'normalizeHeader', 'normalizeDDL', 'aiParseAndFill', 'xlsxCellToText',
      'splitMulti', 'splitAssets', 'stripMatrixPrefix', 'parseCopyInfo',
      'extractBracketItem', 'extractColonSuffix', 'recordToReq'
    ]
  },
  {
    name: '命名与甘特图导出',
    note: '甘特图加列时必改 4 处：LEFT 数组、C_xxx 列常量、st.cols 列宽、dataValidation.col。规范名称顺序是 ①文学设定 ②美术。',
    patterns: [
      'generateReqNames', 'litNodeToAsset', 'renderReqNamesBlock', 'exportExcelGantt',
      'rescheduleAllForExport', '_exportComputeCapacity', '_exportBuildInfoSheet',
      '_exportBuildHolidaySheet', '_exportBuildManpowerSheet', '_exportInjectFreezeDropdown'
    ]
  },
  {
    name: '界面渲染与表单',
    note: '排期前的 4 类追问弹窗（量级/开发模式/角色卡/概念草图）都在 runPreScheduleModals。',
    patterns: [
      'switchView', 'renderInputForm', 'renderAssetsPicker', 'renderSpecialPicker',
      'setSelectedAssets', 'getSelectedAssets', 'getSelectedSpecialItems',
      'setSelectedSpecialItems', 'renderPendingQueue', 'selectPendingRecord',
      'fillOneRecord', 'readCurrentFormToRecord', 'clearFormFields',
      'renderPool', 'submitRequirement', 'submitBatch', 'buildSingleReq',
      'runPreScheduleModals', 'renderSettings', 'renderFlowsEditor', 'aiSend'
    ]
  },
  {
    name: '状态持久化',
    note: '数据存浏览器 localStorage，不上服务器，各人用各人的。改内置 flows/holidays 结构要把 _cfgVersion +1。',
    patterns: ['loadState', 'saveState', 'normalizeReq', '_mergeUserFlowNodes', '_saveReqToPool', 'getReq', 'getPerson']
  }
];

// ---------- 扫描：找每个标识符的定义行 ----------
function findDefLine(name) {
  // 匹配顶层声明：function X / const X = / let X = / var X =
  const re = new RegExp('^\\s*(?:function\\s+' + name + '\\b|(?:const|let|var)\\s+' + name + '\\s*=)');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

// 提取定义行上方紧邻的注释首行，作为一句话说明
function firstCommentAbove(lineNo) {
  let i = lineNo - 2;
  const buf = [];
  while (i >= 0 && /^\s*(\/\/|\*|\/\*)/.test(lines[i])) {
    buf.unshift(lines[i].replace(/^\s*(\/\/+|\/?\*+\/?)\s?/, '').trim());
    i--;
  }
  const text = buf.filter(Boolean).join(' ');
  if (!text) return '';
  // 只取第一句，去掉 ⚠️ 之类的前缀噪音
  const first = text.split(/[。；]/)[0].replace(/^[⚠️✅★\s]+/, '').trim();
  return first.length > 46 ? first.slice(0, 46) + '…' : first;
}

const found = [];
const missing = [];
const rows = [];

GROUPS.forEach(g => {
  const items = [];
  g.patterns.forEach(p => {
    const ln = findDefLine(p);
    if (ln) {
      items.push({ name: p, line: ln, desc: firstCommentAbove(ln) });
      found.push(p);
    } else {
      missing.push(p);
    }
  });
  items.sort((a, b) => a.line - b.line);
  if (items.length) rows.push({ group: g, items });
});

// ---------- --check 模式：只报告，不写文件 ----------
if (CHECK_ONLY) {
  console.log('源文件总行数：' + lines.length);
  console.log('索引到函数/常量：' + found.length + ' 个');
  if (missing.length) {
    console.log('\n⚠️ 以下标识符在源码里找不到（可能已重命名或删除，请更新本脚本的 GROUPS）：');
    missing.forEach(m => console.log('   - ' + m));
    process.exit(1);
  }
  console.log('✅ 全部标识符都能定位');
  process.exit(0);
}

// ---------- 生成 Markdown ----------
const now = new Date();
const stamp = now.getFullYear() + '-' +
  String(now.getMonth() + 1).padStart(2, '0') + '-' +
  String(now.getDate()).padStart(2, '0');

let md = '';
md += '# 代码索引（自动生成，不要手改）\n\n';
md += '> 由 `scripts/gen-code-index.js` 自动生成 | 生成时间：' + stamp + '\n';
md += '> 源文件：`' + path.basename(SRC) + '`（共 ' + lines.length + ' 行）\n\n';
md += '**改完代码请重新跑一次**：`node scripts/gen-code-index.js`\n\n';
md += '---\n\n';
md += '## 为什么有这份文件\n\n';
md += '交接文档里曾经直接写死行号（如「autoSchedule 在 2041 行」）。\n';
md += '代码一改行号就漂移，跳过去看到的是别的东西 —— 比没有行号更误导。\n';
md += '所以行号统一放在这里自动生成，其它文档只提函数名。\n\n';
md += '**在编辑器里定位的最快方式**：`Ctrl+F` 搜 `function 函数名`，\n';
md += '比翻行号更可靠（行号可能因为你自己的改动而变）。\n\n';
md += '---\n\n';

rows.forEach(r => {
  md += '## ' + r.group.name + '\n\n';
  if (r.group.note) md += '> ' + r.group.note + '\n\n';
  md += '| 行号 | 名称 | 作用 |\n';
  md += '|---:|---|---|\n';
  r.items.forEach(it => {
    md += '| ' + it.line + ' | `' + it.name + '` | ' + (it.desc || '—') + ' |\n';
  });
  md += '\n';
});

if (missing.length) {
  md += '---\n\n## ⚠️ 索引脚本里列了但源码里找不到\n\n';
  md += '说明这些函数被重命名或删除了，请更新 `scripts/gen-code-index.js` 的 `GROUPS`：\n\n';
  missing.forEach(m => { md += '- `' + m + '`\n'; });
  md += '\n';
}

md += '---\n\n';
md += '## 统计\n\n';
md += '- 索引条目：' + found.length + ' 个\n';
md += '- 源文件行数：' + lines.length + '\n';
if (missing.length) md += '- 失效条目：' + missing.length + ' 个（见上）\n';

fs.writeFileSync(OUT, md, 'utf8');
console.log('✅ 已生成 ' + path.basename(OUT));
console.log('   索引 ' + found.length + ' 个函数/常量，源文件 ' + lines.length + ' 行');
if (missing.length) {
  console.log('⚠️  ' + missing.length + ' 个标识符找不到：' + missing.join(', '));
  console.log('   请更新本脚本的 GROUPS 配置');
}
