#!/usr/bin/env node
/**
 * ============================================================
 * 发布前脱敏检查脚本 (Pre-Release Desensitization Check)
 * ------------------------------------------------------------
 * 用法：
 *   node scripts/pre-release-check.js
 *
 * 检测项：
 *   1. API Key / 密钥泄露（OpenAI / Claude / Gemini / 阿里 / 各种通用格式）
 *   2. 真实人名 / 内部团队称呼（真人测试数据）
 *   3. 私人邮箱地址
 *   4. 电脑用户名 / 本机路径泄露
 *   5. 手机号 / 身份证号 / 银行卡号
 *   6. .env 文件是否被误提交
 *
 * 退出码：0 = 通过，1 = 发现敏感信息（阻止发布）
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ---------- 配置 ----------

// 需要扫描的文件扩展名
const SCAN_EXTENSIONS = new Set([
  '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.json', '.vue', '.py', '.env', '.yaml', '.yml', '.xml',
  '.md', '.txt', '.cfg', '.conf', '.ini', '.css'
]);

// 忽略的目录
const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', '.workbuddy',
  '.idea', '.vscode', 'tmp'
]);

// 忽略的文件
// .env.example 是模板文件，占位符（sk-xxxx...）不是真实 Key，需排除
const IGNORE_FILES = new Set([
  '.gitignore', 'pre-release-check.js', 'package-lock.json',
  'yarn.lock', 'pnpm-lock.yaml', '.env.example',
  'replace-names.js'          // 一次性脱敏工具脚本，含旧称呼映射表，非项目数据
]);

// ---------- 规则定义 ----------

/**
 * 每条规则：{ name, pattern, severity, advice }
 * severity: 'CRITICAL' (必须阻断) | 'WARNING' (需人工确认)
 */
const RULES = [
  // ===== 1. API Key 检测 =====
  {
    name: 'OpenAI API Key',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    severity: 'CRITICAL',
    advice: '发现 OpenAI API Key，请移至 .env 文件并通过环境变量读取'
  },
  {
    name: 'Anthropic API Key',
    pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g,
    severity: 'CRITICAL',
    advice: '发现 Anthropic API Key，请移至 .env 文件'
  },
  {
    name: 'Google Gemini API Key',
    pattern: /AIza[a-zA-Z0-9_-]{35}/g,
    severity: 'CRITICAL',
    advice: '发现 Google Gemini API Key，请移至 .env 文件'
  },
  {
    name: 'GitHub Token',
    pattern: /gh[pousr]_[A-Za-z0-9]{36}/g,
    severity: 'CRITICAL',
    advice: '发现 GitHub Token，请立即吊销并使用环境变量'
  },
  {
    name: 'AWS Access Key',
    pattern: /AKIA[A-Z0-9]{16}/g,
    severity: 'CRITICAL',
    advice: '发现 AWS Access Key，请立即吊销'
  },
  {
    name: 'Slack Token',
    pattern: /xox[baprs]-[a-zA-Z0-9-]+/g,
    severity: 'CRITICAL',
    advice: '发现 Slack Token，请立即吊销'
  },
  {
    name: '通用 API Key 赋值',
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/gi,
    severity: 'CRITICAL',
    advice: '发现硬编码的 API Key 赋值，请移至 .env 文件'
  },
  {
    name: 'Bearer Token',
    pattern: /Bearer\s+[A-Za-z0-9_\-\.]{20,}/g,
    severity: 'CRITICAL',
    advice: '发现 Bearer Token，请移至 .env 文件'
  },
  {
    name: '长十六进制串（疑似密钥）',
    pattern: /['"][a-f0-9]{64}['"]/gi,
    severity: 'WARNING',
    advice: '发现 64 位十六进制串，可能是密钥/哈希，请人工确认'
  },

  // ===== 2. 真实人名 / 内部团队称呼（真人测试数据）=====
  // ⚠️ 此处列出的是本项目中硬编码的内部团队成员称呼
  // 新增成员称呼时，请同步更新此列表
  {
    name: '内部称呼 - 东哥',
    pattern: /东哥/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「东哥」，建议替换为职务代号（如「美术总监」）'
  },
  {
    name: '内部称呼 - 庄哥',
    pattern: /庄哥/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「庄哥」，建议替换为职务代号（如「场景Leader」）'
  },
  {
    name: '内部称呼 - 妹昱',
    pattern: /妹昱/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「妹昱」，建议替换为职务代号'
  },
  {
    name: '内部称呼 - 林老板',
    pattern: /林老板/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「林老板」，建议替换为职务代号'
  },
  {
    name: '内部称呼 - 飞飞',
    pattern: /飞飞/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「飞飞」，建议替换为职务代号（如「角色对接人」）'
  },
  {
    name: '内部称呼 - Aiko',
    pattern: /Aiko/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「Aiko」，建议替换为职务代号'
  },
  {
    name: '内部称呼 - Kuki',
    pattern: /Kuki/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「Kuki」，建议替换为职务代号'
  },
  {
    name: '内部称呼 - 文嘉',
    pattern: /文嘉/g,
    severity: 'WARNING',
    advice: '发现内部团队称呼「文嘉」，建议替换为职务代号（如「角色Leader」）'
  },

  // ===== 3. 私人邮箱 =====
  {
    name: '私人邮箱地址',
    pattern: /[a-zA-Z0-9._%+-]+@(?:qq|gmail|outlook|hotmail|163|126|foxmail|sina|sina\.cn|yahoo)\.com/gi,
    severity: 'WARNING',
    advice: '发现私人邮箱地址，建议移除或替换为公司邮箱/占位符'
  },
  {
    name: '腾讯内部邮箱',
    pattern: /[a-zA-Z0-9._%+-]+@(?:tencent|oa)\.com/gi,
    severity: 'WARNING',
    advice: '发现腾讯内部邮箱，建议移除'
  },

  // ===== 4. 电脑用户名 / 本机路径泄露 =====
  // Windows: C:\Users\<username>\
  // macOS:   /Users/<username>/
  // Linux:   /home/<username>/
  {
    name: 'Windows 用户路径泄露',
    pattern: /C:\\\\?Users\\\\[a-zA-Z0-9_.-]+\\\\/g,
    severity: 'WARNING',
    advice: '发现 Windows 用户路径，暴露了电脑用户名，建议使用相对路径'
  },
  {
    name: 'macOS/Linux 用户路径泄露',
    pattern: /\/(?:Users|home)\/[a-zA-Z0-9_.-]+\//g,
    severity: 'WARNING',
    advice: '发现用户主目录路径，暴露了电脑用户名，建议使用相对路径'
  },
  {
    name: 'WorkBuddy 用户名泄露',
    pattern: /ppxjpeng/gi,
    severity: 'WARNING',
    advice: '发现本机用户名 ppxjpeng，请检查是否为路径泄露'
  },

  // ===== 5. 手机号 / 身份证号 / 银行卡号 =====
  {
    name: '中国大陆手机号',
    pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/g,
    severity: 'CRITICAL',
    advice: '发现手机号，请移除或脱敏（如 138****8888）'
  },
  {
    name: '身份证号',
    pattern: /(?<!\d)\d{17}[\dXx](?!\d)/g,
    severity: 'CRITICAL',
    advice: '发现身份证号，请立即移除'
  },
  {
    name: '银行卡号',
    pattern: /(?<!\d)\d{16,19}(?!\d)/g,
    severity: 'WARNING',
    advice: '发现疑似银行卡号的长数字，请人工确认'
  },

  // ===== 6. 其他敏感信息 =====
  {
    name: '密码赋值',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi,
    severity: 'CRITICAL',
    advice: '发现硬编码密码，请移至 .env 文件'
  },
  {
    name: '私钥文件内容',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    advice: '发现私钥内容，请立即移除并吊销该密钥'
  },
];

// ---------- 扫描逻辑 ----------

let totalFindings = 0;
let criticalCount = 0;
const findings = [];

function walkDir(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      walkDir(fullPath, fileList);
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      // .env 文件本身也要检查是否被 git 跟踪
      if (SCAN_EXTENSIONS.has(ext) || entry.name.startsWith('.env')) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (const rule of RULES) {
    // 重置正则 lastIndex（全局标志 g 会有状态）
    rule.pattern.lastIndex = 0;
    let match;
    while ((match = rule.pattern.exec(content)) !== null) {
      // 找到匹配所在行号
      const matchIndex = match.index;
      let lineNum = 1;
      let pos = 0;
      for (let i = 0; i < lines.length; i++) {
        if (pos + lines[i].length + 1 > matchIndex) {
          lineNum = i + 1;
          break;
        }
        pos += lines[i].length + 1;
      }
      const matchedText = match[0].length > 80
        ? match[0].slice(0, 77) + '...'
        : match[0];

      findings.push({
        file: path.relative(process.cwd(), filePath),
        line: lineNum,
        rule: rule.name,
        severity: rule.severity,
        matched: matchedText,
        advice: rule.advice
      });
      totalFindings++;
      if (rule.severity === 'CRITICAL') criticalCount++;

      // 避免同一规则在同一位置的无限循环
      if (match.index === rule.pattern.lastIndex) {
        rule.pattern.lastIndex++;
      }
    }
  }
}

function checkEnvTracked() {
  // 检查 .env 是否被 git 跟踪
  try {
    const { execSync } = require('child_process');
    const tracked = execSync('git ls-files --error-unmatch .env 2>&1', {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (!tracked.includes('error')) {
      findings.push({
        file: '.env',
        line: '-',
        rule: '.env 被 Git 跟踪',
        severity: 'CRITICAL',
        matched: '.env',
        advice: '.env 文件已被 Git 跟踪！请执行 git rm --cached .env 并提交'
      });
      criticalCount++;
      totalFindings++;
    }
  } catch (e) {
    // .env 未被跟踪 = 正常，忽略
  }
}

// ---------- 主流程 ----------

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          发布前脱敏检查 (Pre-Release Desensitization)        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');
console.log(`扫描目录: ${process.cwd()}`);
console.log(`检测规则: ${RULES.length} 条`);
console.log('');

const files = walkDir(process.cwd());
console.log(`待扫描文件: ${files.length} 个`);
console.log('─'.repeat(64));

for (const file of files) {
  checkFile(file);
}

checkEnvTracked();

// ---------- 输出结果 ----------

console.log('');
if (totalFindings === 0) {
  console.log('✅ 脱敏检查通过！未发现敏感信息，可以安全发布。');
  console.log('');
  process.exit(0);
}

// 按严重程度排序
findings.sort((a, b) => {
  if (a.severity === 'CRITICAL' && b.severity !== 'CRITICAL') return -1;
  if (a.severity !== 'CRITICAL' && b.severity === 'CRITICAL') return 1;
  return a.file.localeCompare(b.file);
});

// 分组输出
const byFile = {};
for (const f of findings) {
  if (!byFile[f.file]) byFile[f.file] = [];
  byFile[f.file].push(f);
}

for (const file of Object.keys(byFile).sort()) {
  console.log(`\n📄 ${file}`);
  for (const f of byFile[file]) {
    const icon = f.severity === 'CRITICAL' ? '🚨' : '⚠️';
    console.log(`  ${icon} [${f.severity}] 第 ${f.line} 行 | ${f.rule}`);
    console.log(`     匹配: ${f.matched}`);
    console.log(`     建议: ${f.advice}`);
  }
}

console.log('');
console.log('═'.repeat(64));
console.log(`扫描结果: 共发现 ${totalFindings} 处敏感信息`);
console.log(`  🚨 CRITICAL (必须修复): ${criticalCount} 处`);
console.log(`  ⚠️  WARNING  (需确认):  ${totalFindings - criticalCount} 处`);
console.log('');

if (criticalCount > 0) {
  console.log('❌ 存在 CRITICAL 级别问题，禁止发布！请修复后重新检查。');
  console.log('');
  console.log('修复步骤：');
  console.log('  1. API Key → 移入 .env 文件，代码改用环境变量读取');
  console.log('  2. 真人数据 → 替换为职务代号（如「美术总监」「场景Leader」）');
  console.log('  3. 私人邮箱 → 删除或替换为占位符 user@example.com');
  console.log('  4. 本机路径 → 改用相对路径');
  console.log('  5. 手机号/身份证 → 脱敏处理（如 138****8888）');
  console.log('  6. .env 被跟踪 → 执行 git rm --cached .env');
  console.log('');
  process.exit(1);
} else {
  console.log('⚠️  仅有 WARNING 级别问题。请人工确认后决定是否发布。');
  console.log('');
  process.exit(0);
}
