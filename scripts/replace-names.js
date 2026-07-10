#!/usr/bin/env node
/**
 * 批量替换内部团队称呼为职务代号
 * 注意：必须先替换带括号的组合形式（如"东哥（总监）"），再替换单独称呼，
 *       否则会产生"美术总监（总监）"这样的语义重复。
 */
const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'ai-scheduling-board.html'),
  path.join(__dirname, '..', 'dist', 'index.html'),
];

// 替换规则 —— 顺序敏感！长串（带括号）必须在前
const replacements = [
  // 第一轮：替换"称呼（职务）"的组合形式，整段换成纯职务
  ['东哥（总监）',      '美术总监'],
  ['庄哥（场景Leader）', '场景Leader'],
  ['飞飞（角色对接人）', '角色对接人'],
  ['文嘉（角色Leader）', '角色Leader'],

  // 第二轮：替换单独称呼
  ['东哥',   '美术总监'],
  ['庄哥',   '场景Leader'],
  ['妹昱',   '评审员A'],
  ['林老板', '评审员B'],
  ['飞飞',   '角色对接人'],
  ['Aiko',   '站点Leader'],
  ['Kuki',   'CG Leader'],
  ['文嘉',   '角色Leader'],
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`⚠️  文件不存在，跳过: ${file}`);
    continue;
  }
  let content = fs.readFileSync(file, 'utf-8');
  let totalReplaced = 0;
  const stats = [];

  for (const [from, to] of replacements) {
    // 统计替换次数
    const count = (content.match(new RegExp(escapeRegExp(from), 'g')) || []).length;
    if (count > 0) {
      content = content.split(from).join(to);
      totalReplaced += count;
      stats.push(`  ${from.padEnd(18)} → ${to.padEnd(12)}  (${count} 处)`);
    }
  }

  fs.writeFileSync(file, content, 'utf-8');
  console.log(`\n📄 ${path.relative(path.join(__dirname, '..'), file)}`);
  console.log(`   共替换 ${totalReplaced} 处`);
  stats.forEach(s => console.log(s));
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.log('\n✅ 全部替换完成！');
