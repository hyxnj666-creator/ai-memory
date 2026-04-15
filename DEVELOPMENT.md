# ai-memory 开发文档

> 从 AI 编辑器对话历史中提取结构化知识（技术决策、架构、TODO、规范），输出可 git 跟踪的记忆文件。

## 项目定位

**不是**又一个 AI 记忆 MCP server（Memoir、CortexMem 已做），**也不是**对话导出工具（cursor-history 已做）。

我们做的是中间缺失的一环：**对话历史 → AI 提取 → 结构化知识文件 → git 同步**。

```
cursor-history 做了这段          我们做这段                        git 做这段
┌─────────────────┐    ┌────────────────────────┐    ┌──────────────────┐
│ 对话历史（本地）  │ →  │ AI 提取 → 结构化 Markdown │ →  │ git push/pull 同步 │
└─────────────────┘    └────────────────────────┘    └──────────────────┘
```

## 竞品分析（2026-04-13 调研）

| 工具 | 做了什么 | **没做**什么 |
|------|----------|-------------|
| cursor-history（npm v0.15） | 导出对话、搜索、迁移、备份 | 不做 AI 提取，不分类，纯导出 |
| CortexMem（MCP） | 从 git + 代码构建语义记忆 | 不读对话历史，只读代码 |
| Memoir（MCP） | AI 自主 remember/recall | 被动存储，不从历史提取 |
| PersistMemory（MCP） | 存 project context | 手动/AI 自主，不从历史提取 |
| memory-mcp（Rust） | git-tracked markdown 存记忆 | 被动存储，不做主动提取 |

**空白地带**：没有工具做"读对话历史 → AI 结构化提取 → 可 git 跟踪的知识文件"。

## 为什么不能用编辑器 AI 替代

- **对话历史在本地文件系统**，不在编辑器 AI 的上下文里
- 需要**批量处理几十上百条对话**，不是问一次 AI 能做的
- 需要**增量处理**（只提取新对话），需要持久化状态
- 输出要**写入文件系统**、组织目录结构
- 需要跑在**自动化流程**里（git hook、定时任务）

## 多源支持

不绑死 Cursor，支持主流 AI 编辑器：

| 来源 | 数据位置 | 格式 | 优先级 |
|------|----------|------|--------|
| **Cursor** | `~/.cursor/projects/{name}/agent-transcripts/*.jsonl` | JSONL（user/assistant 轮次） | P0（MVP） |
| **Claude Code** | `~/.claude/projects/{path}/*.jsonl` | JSONL（完整对话含 tool calls） | P1 |
| **文件导入** | 用户指定路径 | Markdown / 纯文本 | P1 |
| Windsurf | 未公开本地存储路径 | — | P2（等官方公开） |

npm 包名：**`ai-memory`**（通用名，不绑定 Cursor）

---

## MVP 功能范围

### extract — 提取记忆

从对话历史中 AI 提取结构化知识：

```bash
npx ai-memory extract                                # 自动检测来源，提取所有新对话
npx ai-memory extract --source cursor                 # 指定来源
npx ai-memory extract --source claude-code            # Claude Code 对话
npx ai-memory extract --source file chat.md           # 从文件导入
npx ai-memory extract --since "3 days ago"            # 时间过滤
npx ai-memory extract --incremental                   # 只处理上次之后的新对话
npx ai-memory extract --type decision,architecture    # 只提取特定类型
```

提取维度：
- **decision** — 技术决策（选了什么方案、为什么、排除了什么）
- **architecture** — 架构设计（模块划分、数据流、系统设计）
- **convention** — 约定规范（编码规范、命名约定、流程约定）
- **todo** — 待办事项（明确提到后续要做的事）
- **issue** — Bug/问题（遇到的问题及解决方案）

### summary — 生成项目总结

从已提取的记忆生成一份项目级总结：

```bash
npx ai-memory summary                                # 生成/更新 SUMMARY.md
npx ai-memory summary --output MEMORY.md             # 指定输出文件
npx ai-memory summary --focus "支付模块"              # 聚焦特定主题
```

### context — 生成续接 prompt

为新对话生成上下文 prompt，实现跨设备续接：

```bash
npx ai-memory context                                # 生成完整 context
npx ai-memory context --topic "优惠券模块"            # 聚焦特定主题
npx ai-memory context --recent 7                     # 只包含最近 7 天的记忆
npx ai-memory context --copy                         # 直接复制到剪贴板
```

### init — 初始化

```bash
npx ai-memory init                                   # 检测编辑器 + 初始化配置 + .gitignore
```

## V1 暂不做

- watch 模式
- 云同步（Gist/S3/WebDAV）
- Web UI
- 团队共享合并
- 语义搜索（需要 embedding，增加复杂度）

---

## 交互效果

```
$ npx ai-memory extract --incremental

🔍 Detecting AI editors...
   ✓ Cursor: 23 conversations found (d-work)
   ✓ Claude Code: 8 sessions found

🤖 Extracting from 5 new conversations...

   📌 [Cursor] "HF 优惠券 MVP 开发" (2026-04-12)
      → 3 decisions, 2 TODOs, 1 convention

   📌 [Cursor] "ai-gateway-lite 发布" (2026-04-13)
      → 2 decisions, 1 architecture note

   📌 [Claude Code] "OAuth 集成调试" (2026-04-13)
      → 1 decision, 1 issue

✅ Extracted 10 memories → .ai-memory/
   Decisions: 6 | TODOs: 2 | Architecture: 1 | Conventions: 1

$ npx ai-memory context --topic "优惠券"

📝 Generated context prompt (847 tokens):

┌─────────────────────────────────────────────┐
│ Project Context: 优惠券模块                   │
│                                              │
│ ## 技术决策                                   │
│ - 优惠券采用"预计算+快照"模式...              │
│ - 折扣计算在后端完成，前端只展示...           │
│                                              │
│ ## 待办                                       │
│ - 优惠券过期自动回收逻辑                      │
│ - 叠加规则配置界面                            │
│                                              │
│ (Copied to clipboard ✓)                      │
└─────────────────────────────────────────────┘
```

---

## 记忆文件结构

```
.ai-memory/
├── SUMMARY.md                          # 项目级总结（自动生成）
├── decisions/                          # 技术决策
│   ├── 2026-04-12-coupon-architecture.md
│   └── 2026-04-13-gateway-publish.md
├── architecture/                       # 架构笔记
│   └── payment-integration.md
├── conventions/                        # 约定规范
│   └── coding-conventions.md
├── todos/                              # 待办事项
│   └── active.md
├── issues/                             # Bug/问题记录
│   └── resolved.md
├── .last-extraction                    # 增量提取时间戳
└── .config.json                        # 配置
```

### 单条记忆格式

```markdown
## [Decision] OAuth Bridge 模式设计

- **日期**: 2026-03-25
- **来源**: cursor:fa49d306 (HF OAuth 集成)
- **上下文**: hf-app 需要在 App 内嵌 WebView 中完成 Google/Facebook OAuth
- **决策**: 采用 OAuth Bridge 模式，通过 static/oauth-bridge.html 中转回调
- **理由**: App 内嵌 WebView 无法直接接收 redirect，Bridge 页面接收后通过 postMessage 传回 App
- **排除方案**: Deep Link（Android/iOS 行为不一致）、Custom URL Scheme（部分浏览器不支持）
- **影响**: hf-app login 页面、oauth-web、后端 OAuth 回调路由
```

---

## 技术架构

### 数据源解析

#### Cursor agent-transcripts（已验证真实格式）

**位置**：`~/.cursor/projects/{project-slug}/agent-transcripts/`

**目录结构**：
```
agent-transcripts/
├── {uuid}/                        # 每个对话一个文件夹
│   ├── {uuid}.jsonl               # 主对话（JSONL）
│   └── subagents/                 # 子 agent 对话
│       └── {sub-uuid}.jsonl
├── {uuid}.txt                     # 旧版纯文本格式（兼容）
```

**JSONL 行格式**（每行一个 JSON 对象）：
```json
{"role":"user","message":{"content":[{"type":"text","text":"<user_query>\n...\n</user_query>"}]}}
{"role":"assistant","message":{"content":[{"type":"text","text":"..."},{"type":"tool_use","name":"Shell","input":{...}}]}}
```

- `message.content` 是数组，每个元素有 `type`（`text` 或 `tool_use`）
- user 消息的 text 包裹在 `<user_query>` 标签里
- assistant 消息可能包含多个 `tool_use` 块（Shell、Read、Write、Glob 等）
- 没有 timestamp 字段，对话 ID 来自文件夹名（UUID）
- 文件可能很大（100k+ 字符），必须流式逐行读取
- 旧版 `.txt` 格式用 `user:` / `assistant:` 分隔，需要单独解析器

**解析策略**：
1. 扫描 `agent-transcripts/` 下所有 UUID 文件夹
2. 逐行读取 `.jsonl`，按 role 分组为对话轮次
3. 从 text 类型内容提取对话文本，忽略 tool_use 的具体输入
4. 剥离 `<user_query>` 包裹标签
5. 子 agent（`subagents/`）默认忽略，可选包含

#### Claude Code sessions

**位置**：`~/.claude/projects/{path-with-dashes}/*.jsonl`

**格式**：JSONL，含 `tool_use`/`tool_result` 块，逐行读取过滤 assistant 消息。

#### 文件导入

支持 Markdown / 纯文本，按分隔符分段。

### 项目结构

```
ai-memory/
├── src/
│   ├── index.ts                  # CLI 入口
│   ├── cli.ts                    # 参数解析
│   ├── commands/
│   │   ├── extract.ts            # extract 命令
│   │   ├── summary.ts            # summary 命令
│   │   ├── context.ts            # context 命令
│   │   └── init.ts               # init 命令
│   ├── sources/
│   │   ├── base.ts               # Source 接口定义
│   │   ├── cursor.ts             # Cursor transcript 解析
│   │   ├── claude-code.ts        # Claude Code session 解析
│   │   ├── file.ts               # 文件导入
│   │   └── detector.ts           # 自动检测可用来源
│   ├── extractor/
│   │   ├── ai-extractor.ts       # AI 提取核心（调 LLM）
│   │   └── prompts.ts            # 提取 prompt 模板
│   ├── store/
│   │   ├── memory-store.ts       # 记忆读写（Markdown 文件）
│   │   └── state.ts              # 增量状态管理
│   ├── output/
│   │   ├── terminal.ts           # 终端美化输出
│   │   └── markdown.ts           # Markdown 生成
│   └── types.ts                  # 类型定义
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── .gitignore
```

### AI 提取 Prompt

```
You are a software development conversation analyst. Given a conversation
between a developer and an AI assistant, extract structured knowledge.

Extract ONLY concrete, actionable information. Skip small talk, debugging
attempts that didn't work, and routine code generation.

For each extracted item, return JSON:

[
  {
    "type": "decision" | "architecture" | "convention" | "todo" | "issue",
    "title": "Short descriptive title",
    "date": "YYYY-MM-DD",
    "context": "What problem or situation led to this",
    "content": "The actual decision/design/convention/todo/issue",
    "reasoning": "Why this choice was made (for decisions)",
    "alternatives": "What was considered and rejected (for decisions)",
    "impact": "What parts of the codebase are affected"
  }
]

If the conversation contains no extractable knowledge, return [].

Conversation:
{transcript}
```

---

## 配置文件 `.ai-memory/.config.json`

```jsonc
{
  // 数据源（自动检测，也可手动指定）
  "sources": {
    "cursor": {
      "enabled": true,
      "projectName": "d-work"         // 自动检测
    },
    "claudeCode": {
      "enabled": true
    }
  },

  // 提取配置
  "extract": {
    "types": ["decision", "architecture", "convention", "todo", "issue"],
    "ignoreConversations": [],         // 跳过特定对话 ID
    "minConversationLength": 5         // 少于 5 轮的对话跳过
  },

  // 输出配置
  "output": {
    "dir": ".ai-memory",
    "summaryFile": "SUMMARY.md",
    "language": "zh"                   // 输出语言
  },

  // AI 模型
  "model": ""                          // 空 = 自动选择
}
```

---

## 跨设备工作流

```
工作电脑                                     家里电脑
────────                                     ────────
Cursor / Claude Code 对话开发
        │
npx ai-memory extract --incremental
        │
git add .ai-memory/ && git commit && git push
        │                                    git pull
        │                                        │
        │                                    npx ai-memory context --topic "今天的工作"
        │                                        │
        │                                    复制 context → 新对话开头
        │                                        │
        │                                    无缝续接上下文
```

---

## 设计原则

| 原则 | 说明 |
|------|------|
| 零依赖 | 不引入 runtime dependencies |
| npx 即用 | `npx ai-memory extract` 直接跑 |
| 多 AI 厂商 | 共享 `AI_REVIEW_*` 环境变量体系 |
| 多来源 | 不绑死 Cursor，支持 Claude Code 等 |
| CI 友好 | `--json` 输出 + exit code |
| git 友好 | 输出纯 Markdown，天然可 diff/merge |
| 增量处理 | 不重复处理已提取的对话 |

---

## 开发计划

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| **Phase 1** | 项目骨架 + 类型定义 + Cursor transcript 解析器 | 2h |
| **Phase 2** | AI 提取核心（extract 命令 + prompt） | 2h |
| **Phase 3** | 记忆存储 + 增量状态管理 | 1.5h |
| **Phase 4** | Claude Code session 解析器 | 1h |
| **Phase 5** | summary 命令 + context 命令 | 2h |
| **Phase 6** | init 命令 + 自动检测 + 配置 | 1h |
| **Phase 7** | 单元测试 | 1.5h |
| **Phase 8** | README + npm 发布 | 1h |

**MVP 总计：~12h**

---

## 风险与对策

| 风险 | 对策 |
|------|------|
| Cursor/Claude Code 对话格式变更 | Source 层抽象，解析逻辑隔离，易于适配新格式 |
| 官方内置对话同步 | 我们的价值不是同步对话，而是**提取结构化知识**，即使官方同步了对话，知识提取仍有价值 |
| 对话太长 token 爆 | 截断 + 分段提取，单次不超过 8k tokens |
| 提取质量不稳定 | 提供 dry-run 预览，用户可编辑修正 |

---

## 发布标准

- [ ] extract 命令可从 Cursor + Claude Code 提取记忆
- [ ] summary 命令可生成项目总结
- [ ] context 命令可生成续接 prompt
- [ ] init 命令可自动检测和初始化
- [ ] 增量提取正常工作
- [ ] 20+ 单元测试通过
- [ ] TypeScript strict 通过
- [ ] 双语 README
- [ ] MIT License
