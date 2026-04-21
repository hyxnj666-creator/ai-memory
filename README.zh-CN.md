# ai-memory

[![npm version](https://img.shields.io/npm/v/ai-memory-cli.svg)](https://www.npmjs.com/package/ai-memory-cli)
[![CI](https://github.com/conorliu/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/conorliu/ai-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 把 AI 聊天记录变成可搜索、可追踪的项目知识库。

```bash
npx ai-memory-cli extract          # 自动发现对话、提取知识
npx ai-memory-cli search "OAuth"   # 即时搜索任意记忆
npx ai-memory-cli rules            # 从约定自动生成 Cursor Rules
npx ai-memory-cli context --copy   # 复制上下文，无缝续接任意会话
```

从 AI 编辑器对话历史（Cursor、Claude Code）中提取结构化知识，保存为可 git 跟踪的 Markdown 文件。不再让技术决策、架构设计和 TODO 埋没在聊天记录里。

> **[English README](README.md)**

---

## 为什么用 ai-memory？

每天在 Cursor 或 Claude Code 开发时，你会做出无数决策。这些决策活在聊天记录里，换台电脑、开个新对话、来个新队友就丢了。**ai-memory 把短暂的对话变成持久、可搜索的知识库。**

| 你得到的                    | 怎么实现的                                                           |
| --------------------------- | -------------------------------------------------------------------- |
| **结构化知识**        | AI 提取决策、架构、约定、TODO、问题                                  |
| **Git 可追踪**        | 纯 Markdown 文件，和代码一起提交                                     |
| **Token 节省**        | `context` 命令将上千轮对话压缩为精准 prompt — 通常节省 90%+ token |
| **团队感知**          | 按作者分目录，无合并冲突                                             |
| **Cursor Rules 导出** | 自动从约定生成 `.cursor/rules/` — 其他工具没有这个                |
| **零配置**            | `npx` 开箱即用                                                     |

---

## 快速开始

```bash
# 设置 API key（任意 OpenAI 兼容提供商）
export AI_REVIEW_API_KEY=sk-...    # 或 OPENAI_API_KEY

# 提取所有对话中的知识
npx ai-memory-cli extract

# 搜索知识库
npx ai-memory-cli search "认证"

# 从约定生成 Cursor Rules
npx ai-memory-cli rules

# 生成上下文 prompt 并复制到剪贴板
npx ai-memory-cli context --copy

# 提交到 git
git add .ai-memory/ && git commit -m "chore: 添加 AI 对话知识库"
```

---

## 命令

### `list` — 浏览对话列表

```bash
npx ai-memory-cli list                             # 显示所有对话及提取状态
npx ai-memory-cli list --source cursor             # 指定来源
npx ai-memory-cli list --json                      # JSON 输出
```

输出显示序号、日期、轮次数、提取状态（`[+]` 已提取，`[ ]` 待处理）和标题。

### `extract` — 提取记忆

```bash
npx ai-memory-cli extract                          # 自动检测所有来源
npx ai-memory-cli extract --incremental            # 只处理新增/修改的对话
npx ai-memory-cli extract --pick 4                 # 按列表序号处理
npx ai-memory-cli extract --pick 1,4,7             # 按多个序号处理
npx ai-memory-cli extract --id b5677be8            # 按对话 ID 前缀处理
npx ai-memory-cli extract --since "3 days ago"     # 只处理最近 3 天的对话
npx ai-memory-cli extract --source cursor          # 指定来源
npx ai-memory-cli extract --type decision,todo     # 只提取指定类型
npx ai-memory-cli extract --force                  # 覆盖已有文件
npx ai-memory-cli extract --author "alice"         # 指定作者名
npx ai-memory-cli extract --dry-run                # 预览（不调用 LLM）
npx ai-memory-cli extract --verbose                # 显示 LLM 请求详情
npx ai-memory-cli extract --json                   # JSON 输出（CI 友好）
```

提取结束后会打印质量统计：过滤了多少低质量结果（内容过短或重复标题）。

### `search` — 搜索记忆

```bash
npx ai-memory-cli search "OAuth"                   # 关键词搜索所有记忆
npx ai-memory-cli search "支付" --type decision     # 按类型过滤
npx ai-memory-cli search "auth" --author alice      # 按作者过滤
npx ai-memory-cli search "API" --include-resolved   # 包含已归档的记忆
npx ai-memory-cli search "配置" --json              # JSON 输出
```

结果按相关度排序（标题匹配 > 内容 > 上下文），关键词高亮显示。

### `rules` — 导出 Cursor Rules

从提取的约定和决策自动生成 `.mdc` 文件，Cursor 会自动应用到所有 AI 回复：

```bash
npx ai-memory-cli rules                            # 生成 .cursor/rules/ai-memory-conventions.mdc
npx ai-memory-cli rules --output my-rules.mdc      # 自定义输出路径
npx ai-memory-cli rules --all-authors              # 包含团队所有人的约定
```

这就是 **对话到规则的闭环** — 从聊天历史提取约定，自动生成编辑器规则。其他工具没有这个能力。

### `resolve` — 标记记忆为已归档

决策可能被推翻，TODO 可能已完成。让知识库保持鲜活：

```bash
npx ai-memory-cli resolve "OAuth"                  # 标记匹配的记忆为 resolved
npx ai-memory-cli resolve "OAuth" --undo           # 恢复为 active
```

已归档的记忆在 `context`、`summary`、`search` 中默认不显示。用 `--include-resolved` 强制包含。

### `summary` — 生成项目总结

```bash
npx ai-memory-cli summary                          # 生成/更新 SUMMARY.md
npx ai-memory-cli summary --output MEMORY.md       # 自定义输出路径
npx ai-memory-cli summary --focus "支付模块"        # 聚焦特定主题
npx ai-memory-cli summary --all-authors            # 包含所有团队成员
npx ai-memory-cli summary --include-resolved       # 包含已归档的记忆
```

### `context` — 生成续接 prompt

在新对话或换设备时无缝续接上下文：

```bash
npx ai-memory-cli context                          # 生成上下文块（即时，无需调用 LLM）
npx ai-memory-cli context --copy                   # 生成并复制到剪贴板
npx ai-memory-cli context --topic "优惠券系统"      # 聚焦特定主题
npx ai-memory-cli context --recent 7               # 只包含最近 7 天的记忆
npx ai-memory-cli context --output CONTEXT.md      # 写入文件
npx ai-memory-cli context --summarize              # 用 LLM 生成精简摘要（较慢，消耗 token）
npx ai-memory-cli context --all-authors            # 包含所有团队成员
npx ai-memory-cli context --include-resolved       # 包含已归档的记忆
```

默认模式（不加 `--summarize`）直接从记忆组装结构化块——即时、免费、无信息损失。将输出粘贴到新对话开头。

### `init` — 初始化配置

```bash
npx ai-memory-cli init
```

自动检测编辑器，创建 `.ai-memory/.config.json`，并将 `.state.json` 加入 `.gitignore`。

---

## 提取维度

| 类型                   | 捕获内容                               |
| ---------------------- | -------------------------------------- |
| **decision**     | 技术决策：选了什么、为什么、排除了什么 |
| **architecture** | 系统设计、模块划分、数据流             |
| **convention**   | 编码规范、命名约定、流程约定           |
| **todo**         | 明确提到的后续待办事项                 |
| **issue**        | 遇到的 Bug 及解决方案                  |

只提取具体、可操作的信息。低质量结果（内容过短、标题与内容重复）会被自动过滤。

---

## 支持的来源

| 来源                  | 数据位置                                         | 状态             |
| --------------------- | ------------------------------------------------ | ---------------- |
| **Cursor**      | `~/.cursor/projects/{name}/agent-transcripts/` | 已支持           |
| **Claude Code** | `~/.claude/projects/{path}/*.jsonl`            | Beta（自动检测） |
| Windsurf              | 本地存储路径未公开                               | 计划中           |

---

## 典型工作流

### 首次提取

```bash
npx ai-memory-cli list                    # 先看有哪些对话
npx ai-memory-cli extract                 # 全量提取（首次需几分钟）
npx ai-memory-cli rules                   # 生成 Cursor Rules
git add .ai-memory/ .cursor/rules/
git commit -m "chore: 初始化 AI 对话知识库"
```

### 日常增量更新

```bash
npx ai-memory-cli extract --incremental   # 每次编码结束后
npx ai-memory-cli rules                   # 刷新 Cursor Rules
git add .ai-memory/ && git commit -m "chore: 更新记忆"
```

### 开始新对话

```bash
npx ai-memory-cli context --copy          # 复制上下文到剪贴板
# 粘贴到新 Cursor/Claude Code 会话开头
```

输出示例：

```markdown
## 项目上下文

### 关键决策（直接遵循，无需重新讨论）
- **使用 OAuth Bridge 模式**: WebView 无法直接接收 redirect...

### 约定（始终遵守）
- **此项目中不使用 getServerSideProps**: ...

### 当前待办
- [ ] 为支付 webhook handler 添加重试逻辑
```

### 搜索知识库

```bash
npx ai-memory-cli search "支付"           # 查找所有支付相关记忆
npx ai-memory-cli search "认证" --type decision  # 只看认证相关决策
```

---

## 团队工作流

多人在同一 git 仓库使用时，每个人的记忆自动按作者分目录存放，互不冲突。

### 工作原理

作者身份自动检测（优先级：`--author` CLI 参数 > `config.author` > `git config user.name` > 系统用户名），不需要手动配置。

```
.ai-memory/
├── conor/
│   ├── decisions/
│   │   └── 2026-04-15-oauth-bridge.md
│   └── todos/
│       └── 2026-04-15-add-retry.md
├── alice/
│   ├── decisions/
│   │   └── 2026-04-16-payment-design.md
│   └── architecture/
│       └── 2026-04-16-module-split.md
└── .config.json
```

### 日常用法

```bash
# 每个人正常提取，自动写入自己的目录
npx ai-memory-cli extract --incremental

# 生成自己的上下文（默认只包含自己的记忆）
npx ai-memory-cli context --copy

# 想看团队所有人的记忆
npx ai-memory-cli summary --all-authors
npx ai-memory-cli context --all-authors --copy

# 临时指定作者名
npx ai-memory-cli extract --author "alice"
```

### 已有项目升级

旧版（v1.2 之前）的记忆存放在 `.ai-memory/decisions/` 等平级目录下。升级后：

- 旧文件会被正常读取（向后兼容），`author` 为空
- 新提取的记忆自动写入 `.ai-memory/{author}/decisions/` 等目录
- 无需手动迁移

---

## 跨设备工作流

```
工作机                                         家用机
──────                                         ──────
Cursor / Claude Code 开发
        --> npx ai-memory-cli extract --incremental
        --> git add .ai-memory/
git commit && git push
                                               git pull
                                               --> npx ai-memory-cli context --topic "今天的工作"
                                               --> 粘贴上下文到新对话
                                               --> 无缝续接
```

---

## 配置

`ai-memory-cli` 开箱即用，无需配置。如需自定义，运行 `npx ai-memory-cli init` 或手动创建 `.ai-memory/.config.json`：

```jsonc
{
  "sources": {
    "cursor": { "enabled": true, "projectName": "my-project" },
    "claudeCode": { "enabled": true }
  },
  "extract": {
    "types": ["decision", "architecture", "convention", "todo", "issue"],
    "ignoreConversations": [],    // 要跳过的对话 UUID
    "minConversationLength": 5   // 跳过过短的对话
  },
  "output": {
    "dir": ".ai-memory",
    "summaryFile": "SUMMARY.md",
    "language": "zh"             // "zh" 或 "en"，摘要输出语言
  },
  "model": "",                   // 留空则自动选择
  "author": ""                   // 留空则从 git config user.name 自动检测
}
```

### 环境变量

| 变量                   | 说明                                        |
| ---------------------- | ------------------------------------------- |
| `AI_REVIEW_API_KEY`  | API key（推荐，与 ai-review-pipeline 共用） |
| `OPENAI_API_KEY`     | OpenAI API key                              |
| `OPENAI_BASE_URL`    | 自定义 OpenAI 兼容 API 地址                 |
| `OPENAI_MODEL`       | OpenAI 模型覆盖                             |
| `ANTHROPIC_API_KEY`  | Anthropic API key（需兼容代理）             |
| `ANTHROPIC_BASE_URL` | Anthropic 代理地址                          |
| `AI_REVIEW_BASE_URL` | 自定义 API 地址                             |
| `AI_REVIEW_MODEL`    | 使用的模型（默认：`gpt-4o-mini`）         |

---

## 输出结构

每条记忆是独立的文件，按作者和类型分目录存放：

```
.ai-memory/
├── SUMMARY.md                              # 项目总结（summary 命令生成）
├── conor/                                  # 按作者分目录
│   ├── decisions/
│   │   ├── 2026-04-12-oauth-bridge-pattern.md
│   │   └── 2026-04-13-async-job-queue-design.md
│   ├── architecture/
│   │   └── 2026-04-10-payment-module-design.md
│   ├── conventions/
│   │   └── 2026-04-08-coding-conventions.md
│   ├── todos/
│   │   └── 2026-04-12-add-retry-logic.md
│   └── issues/
│       └── 2026-04-11-sqlite-locking-fix.md
├── .index/                                 # 提取索引（自动管理）
├── .config.json                            # 配置文件（建议提交到 git）
└── .state.json                             # 提取状态（加入 .gitignore）
```

将 `.ai-memory/.state.json` 加入 `.gitignore`——它记录哪些对话已处理，是机器相关的文件。

---

## CI 集成

```yaml
# .github/workflows/memory.yml
- name: 提取 AI 记忆
  run: npx ai-memory-cli extract --incremental --json
  env:
    AI_REVIEW_API_KEY: ${{ secrets.AI_REVIEW_API_KEY }}
```

---

## 环境要求

- Node.js >= 18
- 任意 OpenAI 兼容提供商的 API key

> **提示：** Node.js 22+ 可通过读取 Cursor 数据库获取更准确的对话标题。Node 18-20 会从首条消息提取标题（正常使用不受影响）。

## License

MIT — [Conor Liu](https://github.com/conorliu)
