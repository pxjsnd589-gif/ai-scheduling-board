# API Key 安全管理指南

> 本文档涵盖 API Key 的限额设置、定期更换策略、以及完整的安全使用规范。

---

## 一、当前项目状态

| 项目 | 状态 |
|------|------|
| 仓库 | https://github.com/pxjsnd589-gif/ai-scheduling-board |
| API Key 数量 | **0 个**（纯前端工具，未接入外部 API） |
| 敏感信息 | 存在内部团队称呼（真人测试数据），详见脱敏检查报告 |

> 当前项目是纯前端排期工具，没有调用任何外部 API。以下指南为**未来接入 API 时**的规范。

---

## 二、API Key 存储规范

### 2.1 绝对禁止

```
❌ 禁止在代码中硬编码 API Key
❌ 禁止将 .env 文件提交到 Git 仓库
❌ 禁止将 API Key 写入 README / 文档 / 注释
❌ 禁止在聊天记录 / 截图中暴露 API Key
❌ 禁止将 API Key 作为 URL 参数传递
```

### 2.2 正确做法

```bash
# 1. 创建 .env 文件（已被 .gitignore 忽略）
cp .env.example .env

# 2. 填入真实 Key
echo 'OPENAI_API_KEY=sk-真实key' >> .env

# 3. 代码中通过环境变量读取
```

**前端项目**（Vite / Webpack）：
```javascript
// Vite
const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

// Webpack
const apiKey = process.env.OPENAI_API_KEY;
```

**Node.js 后端**：
```javascript
require('dotenv').config();
const apiKey = process.env.OPENAI_API_KEY;
```

---

## 三、API Key 限额设置（按服务商）

### 3.1 OpenAI

**路径**：[platform.openai.com](https://platform.openai.com) → Settings → Limits

| 设置项 | 建议值 | 说明 |
|--------|--------|------|
| Monthly budget (hard limit) | $20-$50 | 月度硬上限，超过自动停止 |
| Monthly budget (soft limit) | $15 | 软上限，邮件提醒 |
| Project-level limits | 按项目分配 | 每个 Project 单独限额 |
| Rate limits (RPM/TPM) | 按需 | 每分钟请求/Token 数 |

**操作步骤**：
1. 进入 Settings → Members → 选择 Project
2. 设置 Project spending limit
3. 开启 Usage alerts（邮件通知）

### 3.2 Anthropic Claude

**路径**：[console.anthropic.com](https://console.anthropic.com) → Settings → Billing

| 设置项 | 建议值 |
|--------|--------|
| Monthly spend limit | $20-$50 |
| Usage notification threshold | 80% |

### 3.3 Google Gemini

**路径**：[aistudio.google.com](https://aistudio.google.com) → API Key 设置

- 免费版有内置限额（60 req/min）
- 付费版可在 Google Cloud Console → Quotas 中设置限额

### 3.4 阿里通义千问 (DashScope)

**路径**：[dashscope.aliyun.com](https://dashscope.aliyun.com) → 账户管理

- 设置消息提醒阈值
- 开启余额不足预警

### 3.5 DeepSeek

**路径**：[platform.deepseek.com](https://platform.deepseek.com) → 账户

- 充值预付费模式（用完即停）
- 设置余额预警阈值

---

## 四、定期更换策略

### 4.1 更换周期

| Key 类型 | 更换周期 | 触发条件 |
|----------|----------|----------|
| 生产环境 Key | 每 **90 天** | 定期更换 |
| 测试环境 Key | 每 **180 天** | 定期更换 |
| 开发环境 Key | 每 **180 天** | 定期更换 |
| 疑似泄露 | **立即** | GitGuardian 告警 / 日志异常 |

### 4.2 更换操作流程

```
1. 在服务商控制台创建新 Key
2. 在 .env 文件中替换为新 Key
3. 验证新 Key 正常工作（测试 API 调用）
4. 在服务商控制台删除旧 Key（吊销）
5. 确认无服务中断
6. 更新本指南的更换日期记录
```

### 4.3 更换记录表

> 每次更换后在此记录

| 日期 | 服务商 | 操作人 | 旧Key后4位 | 新Key后4位 | 原因 |
|------|--------|--------|------------|------------|------|
| - | - | - | - | - | 初始状态，暂无API Key |

---

## 五、泄露应急响应

### 如果发现 API Key 泄露（如被提交到 GitHub）：

```
Step 1 【立即 - 5分钟内】在服务商控制台吊销（删除）泄露的 Key
Step 2 【立即】创建新 Key，更新 .env
Step 3 【10分钟内】检查服务商用量日志，确认是否有异常调用
Step 4 【30分钟内】如果有异常调用，联系服务商申请费用豁免
Step 5 【1小时内】使用 BFG 或 git-filter-repo 清除 Git 历史中的 Key
       git filter-repo --replace-text <(echo "sk-旧key==>REMOVED")
Step 6 【完成后】强制推送清理后的历史
       git push origin --force --all
Step 7 【记录】在本指南记录事件，分析原因，防止再次发生
```

---

## 六、安全检查清单（发布前必做）

每次发布前，运行以下检查：

```bash
# 1. 运行脱敏检查脚本
node scripts/pre-release-check.js

# 2. 确认 .env 未被 Git 跟踪
git ls-files | grep -E "^\.env$"
# 如果有输出，执行：git rm --cached .env

# 3. 检查 Git 历史中是否有密钥泄露
# （由 GitGuardian GitHub Actions 自动完成）

# 4. 确认 API Key 限额已设置
# （手动在服务商控制台确认）

# 5. 确认 .gitignore 包含 .env
grep "\.env" .gitignore
```

---

## 七、各服务商控制台链接

| 服务商 | 控制台 | API Key 管理 | 限额设置 |
|--------|--------|-------------|----------|
| OpenAI | platform.openai.com | API Keys | Settings → Limits |
| Anthropic | console.anthropic.com | API Keys | Settings → Billing |
| Google Gemini | aistudio.google.com | Get API Key | Cloud Console → Quotas |
| 阿里通义 | dashscope.aliyun.com | API-KEY 管理 | 账户管理 |
| DeepSeek | platform.deepseek.com | API Keys | 充值管理 |
| 字节火山 | console.volcengine.com | API Key | 计费管理 |
| GitGuardian | dashboard.gitguardian.com | API Keys | Workspace |
