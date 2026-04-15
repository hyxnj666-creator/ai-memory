# cursor-memory — AI 对话记忆提取与同步工具

> 从 Cursor AI 对话中提取关键决策、上下文、进度，生成可跨设备同步的结构化记忆文件。

## 项目背景

Cursor 的 AI 对话历史存储在本机 `C:\Users\{user}\.cursor\projects\{project}\agent-transcripts\` 目录下，**无法跨设备同步**。

当前痛点：
- 工作电脑上的 AI 对话，回家后无法继续
- 手动写 context 文件（如 `HF_PRODUCT_MEMORY.md`、`RESUME_CONTEXT.md`）费时费力
- 重要的技术决策、讨论结论散落在不同对话中，难以回溯

本工具解决思路：**不同步对话本身，而是提取对话中的"记忆"**，存入 git 仓库自然同步。

---

## 一、核心功能

### MVP（v1.0）

- [ ] `extract` 命令：读取 Cursor agent-transcripts，AI 提取关键信息
- [ ] 提取维度：技术决策、架构选择、TODO/待办、bug 记录、约定规范
- [ ] 输出为结构化 Markdown 文件（`.cursor-memory/` 目录）
- [ ] 增量提取：只处理上次提取后的新对话
- [ ] `summary` 命令：生成项目级总结（类似 HF_PRODUCT_MEMORY.md）
- [ ] `search` 命令：在记忆中语义搜索
- [ ] 多 AI 模型支持

### v1.1

- [ ] `watch` 模式：监听新对话，自动提取
- [ ] 记忆合并与去重
- [ ] 自定义提取规则（如"只关注支付相关决策"）
- [ ] 支持多项目记忆汇总
- [ ] 导出为 Cursor Rules（`.cursor/rules/`）
- [ ] Web UI 可视化浏览记忆

### v1.2

- [ ] 云同步（可选，GitHub Gist / S3 / WebDAV）
- [ ] 对话重建：从记忆文件生成 context prompt，在新设备续接对话
- [ ] 团队共享模式：多人记忆合并

---

## 二、CLI 设计

```bash
# ── extract：提取记忆 ──
npx cursor-memory extract                              # 提取当前项目的所有对话记忆
npx cursor-memory extract --since "2 days ago"         # 只提取最近 2 天的对话
npx cursor-memory extract --incremental                # 增量提取（推荐）
npx cursor-memory extract --project d-work             # 指定 Cursor 项目名

# ── summary：生成项目总结 ──
npx cursor-memory summary                              # 生成/更新项目记忆总结
npx cursor-memory summary --output MEMORY.md           # 指定输出文件

# ── search：搜索记忆 ──
npx cursor-memory search "支付模块的架构决策"            # 语义搜索
npx cursor-memory search "OAuth" --type decision       # 按类型筛选

# ── context：生成续接 prompt ──
npx cursor-memory context                              # 生成一段 context prompt 供新对话使用
npx cursor-memory context --topic "优惠券模块"          # 聚焦特定主题

# ── init：初始化 ──
npx cursor-memory init                                 # 初始化配置 + .gitignore 规则
```

### 交互流程

```
$ npx cursor-memory extract --incremental

🔍 Scanning Cursor transcripts...
   Project: d-work
   Found 13 conversations (3 new since last extraction)

🤖 Extracting memories from 3 conversations...

   📌 Conversation 1: "HF 优惠券 MVP 开发"
      → 3 decisions, 2 TODOs, 1 convention

   📌 Conversation 2: "ai-review-pipeline 发布"
      → 2 decisions, 0 TODOs, 1 architecture note

   📌 Conversation 3: "开发工具规划"
      → 1 decision, 3 TODOs, 0 conventions

✅ Extracted 12 memories → .cursor-memory/

$ npx cursor-memory summary

📝 Generating project summary...

✅ Updated .cursor-memory/SUMMARY.md
   Last updated: 2026-04-01
   Total memories: 47
   Decisions: 18 | TODOs: 12 | Architecture: 8 | Conventions: 9
```

---

## 三、记忆结构设计

### 目录结构

```
.cursor-memory/
├── SUMMARY.md                    # 项目级总结（自动生成，git 跟踪）
├── decisions/                    # 技术决策
│   ├── 2026-03-30-coupon-architecture.md
│   └── 2026-04-01-dev-tools-plan.md
├── todos/                        # 待办事项
│   └── active.md
├── conventions/                  # 约定规范
│   └── coding-conventions.md
├── architecture/                 # 架构笔记
│   └── payment-integration.md
├── .last-extraction              # 上次提取时间戳（增量提取用）
└── .config.json                  # 配置
```

### 单条记忆格式

```markdown
## [Decision] OAuth Bridge 模式设计

- **日期**: 2026-03-25
- **来源对话**: fa49d306
- **上下文**: hf-app 需要在 App 内嵌 WebView 中完成 Google/Facebook OAuth
- **决策**: 采用 OAuth Bridge 模式，通过 static/oauth-bridge.html 中转回调
- **理由**: App 内嵌 WebView 无法直接接收 redirect，Bridge 页面接收后通过 postMessage 传回 App
- **影响范围**: hf-app login 页面、oauth-web、后端 OAuth 回调路由
```

---

## 四、技术架构

### Cursor 数据源

| 位置 | 说明 |
|------|------|
| `~/.cursor/projects/{name}/agent-transcripts/*.txt` | 对话摘要（纯文本，user/assistant 轮次） |
| `~/AppData/Roaming/Cursor/User/workspaceStorage/{hash}/state.vscdb` | 完整对话（SQLite，含 tool calls） |

MVP 阶段先读 `agent-transcripts`（纯文本，解析简单），v1.1 再考虑读 `state.vscdb`。

### 项目结构

```
cursor-memory/
├── bin/
│   └── cli.mjs
├── src/
│   ├── commands/
│   │   ├── extract.mjs         # 记忆提取
│   │   ├── summary.mjs         # 总结生成
│   │   ├── search.mjs          # 语义搜索
│   │   ├── context.mjs         # 续接 prompt 生成
│   │   └── init.mjs            # 初始化
│   ├── core/
│   │   ├── ai-client.mjs       # 复用
│   │   ├── env.mjs             # 复用
│   │   ├── config.mjs          # 配置
│   │   ├── transcript-reader.mjs  # 读取 Cursor 对话文件
│   │   ├── memory-extractor.mjs   # AI 提取记忆
│   │   ├── memory-store.mjs       # 记忆存储与读取
│   │   └── summarizer.mjs         # 总结生成
│   └── i18n/
│       ├── zh.mjs
│       └── en.mjs
├── templates/
│   └── cursor-memory.json      # 默认配置
├── package.json
├── README.md
└── LICENSE
```

### Prompt 设计

```
你是一个软件开发对话分析专家。以下是一段开发者与 AI 助手的对话记录。
请从中提取以下类型的关键信息：

1. **技术决策** (decision)：选择了什么方案、为什么这么选、排除了哪些备选
2. **架构设计** (architecture)：系统设计、模块划分、数据流
3. **约定规范** (convention)：编码规范、命名约定、流程约定
4. **待办事项** (todo)：明确提到的后续要做的事
5. **Bug/问题** (issue)：遇到的问题及解决方案

对于每条提取的信息，请返回：
- type: decision | architecture | convention | todo | issue
- title: 简短标题
- context: 背景
- content: 详细内容
- impact: 影响范围（可选）

对话内容：
{transcript}
```

---

## 五、配置文件 `.cursor-memory/.config.json`

```jsonc
{
  "cursorProjectName": "d-work",         // Cursor 项目名（自动检测）
  "extractTypes": ["decision", "architecture", "convention", "todo", "issue"],
  "ignoreConversations": [],              // 跳过特定对话 ID
  "summaryTemplate": "default",           // 总结模板
  "autoExtract": false,                   // 是否自动提取（watch 模式）
  "syncTo": null,                         // 云同步目标（null = 仅 git）
  "model": ""                             // AI 模型
}
```

---

## 六、开发计划

| 阶段 | 任务 | 预计时间 |
|------|------|----------|
| **Phase 1** | 项目初始化 + Cursor 对话文件解析器 | 2h |
| **Phase 2** | AI 记忆提取（extract 命令） | 2h |
| **Phase 3** | 记忆存储 + 增量提取 | 1.5h |
| **Phase 4** | 总结生成（summary 命令） | 1.5h |
| **Phase 5** | 搜索 + context 命令 | 1.5h |
| **Phase 6** | CLI + 配置 + init | 1h |
| **Phase 7** | README + npm 发布 | 0.5h |

**MVP 总计：~10h**

---

## 七、跨设备同步方案

### 方案对比

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **A. 记忆文件 + Git** | 零成本、天然版本控制、团队可见 | 需要手动 extract | **MVP 推荐** |
| B. OneDrive/iCloud 同步 .cursor 目录 | 完整同步 | 路径冲突、文件大、可能损坏 | 不推荐 |
| C. 云同步（Gist/S3） | 自动、跨平台 | 需配置、有成本 | v1.2 考虑 |
| D. Cursor 官方同步 | 最佳体验 | 官方未提供 | 等官方 |

### 推荐工作流

```
工作电脑（开发）
   │
   ├── Cursor AI 对话开发
   ├── npx cursor-memory extract --incremental
   ├── git add .cursor-memory/ && git commit && git push
   │
   ▼
家里电脑（继续）
   │
   ├── git pull
   ├── npx cursor-memory context --topic "今天的工作"
   ├── 将生成的 context 粘贴到新 Cursor 对话开头
   └── 无缝续接上下文
```

---

## 八、进度跟踪

| 日期 | 状态 | 说明 |
|------|------|------|
| 2026-04-01 | 📋 规划完成 | 创建 PLAN.md |
| | ⏳ 待开始 | Phase 1: 项目初始化 + 对话解析器 |
