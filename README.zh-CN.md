# ai-memory

从 AI 编辑器对话历史（Cursor、Claude Code）中提取结构化知识，保存为可 git 跟踪的 Markdown 文件。

不再让技术决策、架构设计和 TODO 埋没在聊天记录里。

```bash
npx ai-memory extract --incremental
```

> **[English README](README.md)**

---

## 问题背景

每天用 Cursor 或 Claude Code 开发时，你会做出无数决策："用 OAuth Bridge 模式"、"异步任务走 SSE bridge"、"这个项目里不用 `getServerSideProps`"。这些决策活在聊天记录里，在这些情况下会彻底丢失：

- 换了台电脑
- 开了新的对话
- 新队友加入项目

`ai-memory` 读取本地对话历史，用 AI 提取有价值的内容，保存为结构化 Markdown 文件提交到 git。

```
你的聊天记录          ai-memory             你的 git 仓库
（本地，非结构化）     （提取 + 分类）        （结构化，可搜索）

Cursor 对话      →   AI 提取             →  .ai-memory/
Claude Code 对话      决策/待办/架构/问题      ├── decisions/
                                            ├── architecture/
                                            ├── todos/
                                            └── ...
```


---

## 快速开始

设置 API key（与 `ai-review-pipeline` 共用同一套环境变量）：

```bash
export AI_REVIEW_API_KEY=sk-...          # 或 OPENAI_API_KEY / ANTHROPIC_API_KEY
export AI_REVIEW_BASE_URL=https://...    # 可选，自定义接口地址
```

在项目目录下运行：

```bash
npx ai-memory extract
```

首次运行会自动检测 Cursor/Claude Code 历史，处理所有对话，在当前目录生成 `.ai-memory/`。提交到 git：

```bash
git add .ai-memory/
git commit -m "chore: 添加 AI 对话知识库"
```

---

## 命令

### `list` — 浏览对话列表

```bash
npx ai-memory list                             # 显示所有对话及提取状态
npx ai-memory list --source cursor             # 指定来源
npx ai-memory list --json                      # JSON 输出
```

输出显示序号、日期、轮次数、提取状态（`[+]` 已提取，`[ ]` 待处理）和真实标题（从 Cursor 数据库读取）。

### `extract` — 提取记忆

```bash
npx ai-memory extract                          # 自动检测所有来源
npx ai-memory extract --incremental            # 只处理上次之后新增或修改的对话
npx ai-memory extract --pick 4                 # 按列表序号处理特定对话
npx ai-memory extract --pick 1,4,7             # 按多个序号处理
npx ai-memory extract --id b5677be8            # 按对话 ID 前缀处理
npx ai-memory extract --since "3 days ago"     # 只处理最近 3 天的对话
npx ai-memory extract --since "2 weeks ago"    # 也支持 weeks 单位
npx ai-memory extract --source cursor          # 指定来源
npx ai-memory extract --type decision,todo     # 只提取指定类型
npx ai-memory extract --dry-run                # 预览要处理的对话（不调用 LLM，不写入文件）
npx ai-memory extract --verbose                # 显示 LLM 请求详情
npx ai-memory extract --json                   # JSON 输出（CI 友好）
```

### `summary` — 生成项目总结

```bash
npx ai-memory summary                          # 生成/更新 SUMMARY.md
npx ai-memory summary --output MEMORY.md       # 自定义输出路径
npx ai-memory summary --focus "支付模块"        # 聚焦特定主题
npx ai-memory summary --verbose                # 显示 LLM 调试信息
```

### `context` — 生成续接 prompt

在新对话或换设备时无缝续接上下文：

```bash
npx ai-memory context                          # 生成上下文块（即时，无需调用 LLM）
npx ai-memory context --copy                   # 生成并复制到剪贴板
npx ai-memory context --topic "优惠券系统"      # 聚焦特定主题
npx ai-memory context --recent 7               # 只包含最近 7 天的记忆
npx ai-memory context --output CONTEXT.md      # 写入文件
npx ai-memory context --summarize              # 用 LLM 生成精简的散文摘要（较慢，消耗 token）
```

默认模式（不带 `--summarize`）直接从记忆组装结构化块 — 即时、免费、无信息损失。将输出粘贴到下一次 Cursor/Claude Code 对话的开头。

### `init` — 初始化配置

```bash
npx ai-memory init
```

自动检测你使用的编辑器，创建 `.ai-memory/.config.json`，并把 `.ai-memory/.state.json` 加入 `.gitignore`。

---

## 提取维度

| 类型                   | 捕获内容                               |
| ---------------------- | -------------------------------------- |
| **decision**     | 技术决策：选了什么、为什么、排除了什么 |
| **architecture** | 系统设计、模块划分、数据流             |
| **convention**   | 编码规范、命名约定、流程约定           |
| **todo**         | 明确提到的后续待办事项                 |
| **issue**        | 遇到的 Bug 及解决方案                  |

只提取具体、可操作的信息，日常代码生成和闲聊一律跳过。

### 输出示例

```markdown
## [Decision] WebView OAuth Bridge 模式

- **日期**: 2026-03-25
- **来源**: cursor:fa49d306 (HF OAuth 集成)
- **上下文**: hf-app 需要在 App 内嵌 WebView 中完成 Google/Facebook OAuth
- **决策**: 采用 OAuth Bridge 模式，通过 static/oauth-bridge.html 中转回调，再用 postMessage 传回 App
- **理由**: App 内嵌 WebView 无法直接接收 redirect，Bridge 页面接收后中转
- **排除方案**: Deep Link（Android/iOS 行为不一致）、Custom URL Scheme（部分浏览器不支持）
- **影响**: hf-app login 页面、oauth-web、后端 OAuth 回调路由
```

---

## 支持的来源

| 来源                  | 数据位置                                         | 状态           |
| --------------------- | ------------------------------------------------ | -------------- |
| **Cursor**      | `~/.cursor/projects/{name}/agent-transcripts/` | 已支持         |
| **Claude Code** | `~/.claude/projects/{path}/*.jsonl`            | Beta（自动检测）|
| Windsurf        | 本地存储路径未公开                               | 计划中         |

---

## 典型工作流

### 首次提取

```bash
# 1. 先看有哪些对话
npx ai-memory list

# 2. 全量提取（首次运行需几分钟）
npx ai-memory extract

# 3. 提交知识库
git add .ai-memory/
git commit -m "chore: 初始化 AI 对话知识库"
```

### 日常增量更新

```bash
# 每次编码结束后
npx ai-memory extract --incremental

# 提交新增记忆
git add .ai-memory/ && git commit -m "chore: 更新对话记忆"
```

### 开始新对话前（关键用法）

```bash
# 生成上下文块并复制到剪贴板
npx ai-memory context --copy

# 聚焦到即将处理的模块
npx ai-memory context --topic "支付模块" --copy

# 或写入文件作为附件
npx ai-memory context --output CONTEXT.md
```

将复制的内容粘贴到新 Cursor/Claude Code 对话的**开头**，输出格式如下：

```markdown
## 项目上下文

### 技术决策（勿随意更改）
- **OAuth Bridge 模式**: WebView 无法直接接收 redirect，改用 Bridge 页中转...

### 代码约定（必须遵守）
- **不在该项目中调用 getServerSideProps**: ...

### 待办事项
- [ ] 给支付 webhook handler 加重试逻辑
```

AI 会立即了解你的项目决策、规范和当前状态，无需重新解释，实现无缝续接。

### 处理特定对话

```bash
# 先查看对话列表，找到序号
npx ai-memory list

# 只处理这一个
npx ai-memory extract --pick 3

# 或按 ID 前缀匹配（list 输出中有显示）
npx ai-memory extract --id b5677be8
```

---

## 跨设备工作流

```
工作电脑                                         家里电脑
────────                                         ────────
Cursor / Claude Code 对话开发
        │
npx ai-memory extract --incremental
        │
git add .ai-memory/
git commit && git push
                                                 git pull
                                                     │
                                                 npx ai-memory context --topic "今天的工作"
                                                     │
                                                 复制 context → 粘贴到新对话开头
                                                     │
                                                 无缝续接上下文
```

---

## 配置

`ai-memory` 开箱即用，无需配置。如需自定义，运行 `npx ai-memory init` 或手动创建 `.ai-memory/.config.json`：

```jsonc
{
  "sources": {
    "cursor": { "enabled": true },
    "claudeCode": { "enabled": true }
  },
  "extract": {
    "types": ["decision", "architecture", "convention", "todo", "issue"],
    "ignoreConversations": [],   // 需要跳过的对话 UUID
    "minConversationLength": 5  // 少于 N 轮的对话跳过
  },
  "output": {
    "dir": ".ai-memory",
    "summaryFile": "SUMMARY.md",
    "language": "zh"            // "zh" 或 "en"，影响 summary/context 输出语言
  },
  "model": ""                   // 留空自动选择
}
```

### 环境变量

| 变量                   | 说明                                        |
| ---------------------- | ------------------------------------------- |
| `AI_REVIEW_API_KEY`  | API key（推荐，与 ai-review-pipeline 共用） |
| `OPENAI_API_KEY`     | OpenAI API key                              |
| `ANTHROPIC_API_KEY`  | Anthropic API key                           |
| `AI_REVIEW_BASE_URL` | 自定义 API 接口地址                         |
| `AI_REVIEW_MODEL`    | 指定模型（默认：`gpt-4o-mini`）           |

---

## 输出目录结构

每条记忆是一个独立 Markdown 文件，按类型分目录存放：

```
.ai-memory/
├── SUMMARY.md                              # 项目级总结（由 summary 命令生成）
├── decisions/                              # 技术决策
│   ├── 2026-04-12-oauth-bridge-pattern.md
│   └── 2026-04-13-async-job-queue-design.md
├── architecture/                           # 架构设计
│   └── 2026-04-10-payment-module-design.md
├── conventions/                            # 编码规范
│   └── 2026-04-08-typescript-strict-mode.md
├── todos/                                  # 待办事项
│   └── 2026-04-12-add-retry-logic.md
├── issues/                                 # Bug/问题记录
│   └── 2026-04-11-sqlite-locking-fix.md
├── .index/                                 # 提取索引（自动维护，无需手动修改）
├── .config.json                            # 配置文件（提交到 git）
└── .state.json                             # 提取状态（加入 .gitignore）
```

每个 Markdown 文件的格式：

```markdown
# OAuth Bridge 模式用于 WebView

> **日期**: 2026-03-25
> **来源**: cursor:fa49d306
> **对话**: HF OAuth 集成

---

**上下文**: hf-app 需要在 App 内嵌 WebView 中完成 OAuth

**内容**: 采用 OAuth Bridge 模式，static/oauth-bridge.html 接收 redirect 后通过 postMessage 传回 App

**理由**: App 内嵌 WebView 无法直接接收 redirect 回调

**排除方案**: Deep Link（Android/iOS 行为不一致）、Custom URL Scheme（兼容性差）

**影响**: hf-app login 页面、oauth-web、后端 OAuth 回调路由
```

`.ai-memory/.state.json` 记录已处理的对话，是机器级别的状态，加入 `.gitignore` 不用提交。

---

## CI 集成

```yaml
# .github/workflows/memory.yml
- name: 提取 AI 对话记忆
  run: npx ai-memory extract --incremental --json
  env:
    AI_REVIEW_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
```

---

## 环境要求

- Node.js >= 22（依赖内置 `node:sqlite` 模块）
- 任意 OpenAI 兼容 provider 的 API key

## License

MIT — [Conor Liu](https://github.com/conorliu)
