# ai-memory

[![npm version](https://img.shields.io/npm/v/ai-memory-cli.svg)](https://www.npmjs.com/package/ai-memory-cli)
[![CI](https://github.com/hyxnj666-creator/ai-memory/actions/workflows/ci.yml/badge.svg)](https://github.com/hyxnj666-creator/ai-memory/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> 把 AI 编辑器的聊天记录变成结构化的 Markdown 决策 + `AGENTS.md` 规则文件 —— 本地优先、git 可追踪、零 `.remember()` 调用。

![ai-memory 30 秒演示](docs/assets/demo/demo.gif)

```bash
npx ai-memory-cli extract                     # 读你编辑器里的聊天历史 → 结构化 Markdown
npx ai-memory-cli rules --target agents-md    # → AGENTS.md（Cursor / Claude / Windsurf / Copilot / Codex 都读）
npx ai-memory-cli recall "OAuth"              # 看任一决策的完整 git 演化轨迹
npx ai-memory-cli context --copy              # 把上下文复制到剪贴板，新会话无缝续接
```

别家"AI memory"工具的起点是一个 `remember()` API，要求你在自己的代码里加埋点。**`ai-memory` 直接读你编辑器里已有的聊天记录** —— Cursor、Claude Code、Windsurf、Copilot Chat、Codex CLI —— 把它转成结构化、git 可追踪的 Markdown，再让所有 AI 编辑器通过 `AGENTS.md` 读回去。**没有新 API 要学，没有运行时记忆服务要维持。**

**本地优先**。对话从不离开你的机器；唯一的对外网络请求是去你自己配置的 LLM 提供商做提取。需要完全离线？用 Ollama / LM Studio。

> **[English README](README.md)**

---

## 只有 ai-memory 做的四件事

前三件是结构性差异，第四件是别家不愿做的工程投入。

1. **零 `.remember()` 埋点**。我们读你**已经写出来**的东西 —— Cursor / Claude Code / Windsurf / Copilot Chat / Codex CLI 的对话记录本来就在硬盘上。没有 SDK 要 import，没有 runtime memory 进程要常驻。对比 mem0 / Letta / Zep / cortexmem —— 它们都要求你在应用代码里手动调 `client.add(...)`。

2. **原生输出 `AGENTS.md`**。`ai-memory rules --target agents-md` 直接生成 Cursor、Claude Code、Windsurf、Copilot、OpenAI Codex CLI 都读的跨工具标准规则文件。**幂等合并**：只动 `<!-- ai-memory:managed-section start --> ... end -->` 之间的内容，你手写的部分按字节保留。`AGENTS.md` 已经被 60K+ 仓库采纳、归 Linux Foundation 治理 —— 别家项目都得手写，我们直接从你的聊天记录生成。

3. **纯 Markdown 在 git 里 —— 没有数据库**。`.ai-memory/` 就是真相之源：你能 `git diff`、能 code review、能开分支、能 revert 的 Markdown 文件。别家"git 可追踪"的 memory 工具版本控制的是它们*内部存储的快照*；我们直接把人类可读的文件格式当作存储层，让 git 接管一切。跨设备同步就是 `git pull`。

4. **基于 git history 的时光机回溯**。`ai-memory recall <query>` 展示每条记忆完整的 commit 演化历史：4 月 1 号这个决策长什么样、4 月 15 号又改成什么样、谁改的。其他 memory 工具只返回"最新版本"，被覆盖掉的旧版默默消失。零新增运行时依赖 —— `recall` 直接走 `node:child_process.execFile` 调你系统已有的 `git`，10 秒超时保护。

## 我们量化自己

[CCEB — Cursor Conversation Extraction Benchmark](docs/benchmarks/cceb-baseline.md)，`gpt-4o-mini`，30 条手写 fixture（v1.1 扩展集）：

| 指标 | v1.1（2026-04-27, **30 fixture**） | v1.0 / v2.5-01（2026-04-26, 9 fixture） | v2.4（2026-04-25, 9 fixture） |
|---|---|---|---|
| 整体 F1 | **64.1%**（P 56.8% / R 73.5%） | 76.2%（P 66.7% / R 88.9%） | 56.0%（P 43.8% / R 77.8%） |
| `decision` / `issue` F1 | **78.3% / 100%** | 75.0% / 100% | 66.7% / 66.7% |
| `architecture` F1 | 72.7%（recall 成新瓶颈） | 100% | 50% |
| 噪声 fixture 处理（闲聊 / 悬而未决 / 假设性讨论） | 100% —— 4 条噪声 fixture 上都不会无中生有 | 100%（2 条） | 100%（2 条） |
| 总耗时 | 239.7 秒 | 47.9 秒 | 70.5 秒 |
| 花费 | ≈ \$0.02 | ≈ \$0.006 | ≈ \$0.005 |

v1.1 扩展（cceb-001 — cceb-030）刻意加入了 v1.0 没覆盖的难点：单条对话出多条记忆（架构 + 约定）、commitment-shape 含糊（流程类 vs 技术类 TODO）、CJK 与中英混用、决策影响 vs 后续 TODO 的边界。F1 比 9 条那一行下降 12 pp，**这不是模型回退** —— 同一个 prompt 跑回 v1.0 的 9 条 fixture 还是 76%。64% 是同一个抽取器在更不挑食的 fixture 分布上的更诚实的测量。剩下最大的杠杆是 `todo` 精度（19 个 FP 里 11 个是 TODO）；按 baseline doc 的分析，下一步是 post-extract pairwise dedup，已挪到 v2.6。

baseline doc 里完整公布了：sample misses、sample false positives、每条 fixture 的明细、v1.0 → v1.1 delta 分析、方法学。**比起跑一个会随上游模型变动而漂移的漂亮数字，我们宁可公布经得起追问的数字**。

**LongMemEval-50**（跨语料 sanity check，[`bench/longmemeval/`](bench/longmemeval/)）：在 LongMemEval-S-cleaned 的确定性 50 题子集上，按我们的字面 token 证据保全 rubric，`gpt-4o-mini` 跑出 **0 / 50 full + 2 / 50 partial**（约 12 分钟，约 \$0.40）。这是一个**有意识的严格代理指标**（"答案的每个 key token 是否都出现在我们提取的记忆里"，**不是** LongMemEval 原生的 QA 正确率 —— 取舍见 [spike 文档 §4.3](docs/cceb-v1.1-and-longmemeval-spike-2026-04-27.md)）；0/50 说明 ai-memory **不是**为「在 500 轮 haystack 里做开放域 QA」设计的，而 [baseline doc](docs/benchmarks/cceb-baseline.md#longmemeval-50--gpt-4o-mini--2026-04-27-v25-08-evidence-preservation-rubric) 里每题 matched/total 显示 partial 信号确实落在该落的位置（single-session-preference：稳定 3-6 / 17-43 tokens）。LongMemEval、LoCoMo 等已有 benchmark 测的是 runtime *recall*（agent 还记不记得某个事实）；我们测的是 *extraction*（聊天记录里能不能提取出对的结构化 artifact）。不同层、不同问题。另见[品类定位 ADR](docs/decisions/2026-04-25-category-positioning.md)。

### 其他能力

- **Token 节省** —— `context` 把上千轮对话压缩成精准 prompt（vs. 直接粘原始历史，通常省 90%+ token）。
- **团队感知** —— `.ai-memory/{author}/` 按作者分目录，两个人在同一项目同时提交记忆不会冲突。
- **跨设备搬运** —— `export` / `import` 把整库往返成版本化的 JSON bundle。
- **零配置** —— `npx ai-memory-cli init --with-mcp` 一行搞定。

---

## FAQ

### "1M token 上下文窗口会不会让你过时？"

简短回答：长上下文和 `ai-memory` 解决的是同一个问题的不同层面。1M
token 让模型能在一次 query 里 *看见* 一段长对话；`ai-memory` 让这
段对话里的 *决策* 持久化、可审阅、可在多 session / 多机器 / 多团
队成员之间共享。这是 HN 上对任何结构化记忆工具最常见的质疑，下面
我们认真回答。

**每次重传历史，成本会复利积累。** 截至 2026-04，前沿模型输入定价
都在每 1M token \$1–\$3 区间
（[Anthropic](https://www.anthropic.com/pricing) /
[OpenAI](https://openai.com/api/pricing) /
[Google AI](https://ai.google.dev/pricing)）。一段跑了两周的 Cursor
session，把 tool-call 负载和 diff 算上，常稳定在 100–300K token；把
它塞进每一轮就是 **每条 query 还没问问题先付 \$0.20–\$0.60**。从
同一段对话生成的 `AGENTS.md` 通常在 1–5K token 量级，且 **每个
session 只加载一次**。乘以团队规模 × 每日 query 数 —— 差距是两个
数量级。

**长上下文检索仍然会在非头部信息上掉点。**「Lost in the middle」
（[Liu et al. 2023](https://arxiv.org/abs/2307.03172)）和 1M 量级
的 needle-in-haystack 测试
（[BABILong, Kuratov et al. 2024](https://arxiv.org/abs/2406.10149)）
都显示：哪怕厂商宣传 1M 窗口，模型在 ~128–256K token 之后的多跳
检索召回会有可量化下降。长上下文对最近 / 最显眼的几轮工作得很好；
但你日常会问的「等一下，三周前我们关于 X 是怎么决定的来着」恰好
落在它的弱区 —— 这才是记忆工具真正服务的查询。提取压缩是无损的：
只保留最该保留的信号（typed decision / convention / architecture）。

**长上下文是单机的；`AGENTS.md` 是仓库级的。** 你笔记本里的聊天
历史帮不到队友的第一天；commit 进 git 的 `.ai-memory/` 目录可以
—— PR 里能审、能开分支、能 revert，每台 clone 该仓库的机器、每个
编辑器都能再读一遍。详细对比见
[只有 ai-memory 做的四件事](#%E5%8F%AA%E6%9C%89-ai-memory-%E5%81%9A%E7%9A%84%E5%9B%9B%E4%BB%B6%E4%BA%8B)
的第 3、4 条。

如果出现以下任一情况我们会重写本节：(a) 1M 窗口前沿定价跌到
\$0.50/M 以下；(b) 长上下文 benchmark 在 500K 之后掉点 < 5%；
(c) 编辑器自身开始原生维护跨 session 的对话压缩。完整论证、引用、
re-spike 触发条件见
[`docs/1m-context-faq-spike-2026-04-27.md`](docs/1m-context-faq-spike-2026-04-27.md)。

---

## 快速开始

```bash
# 30 秒 demo —— 零 API key 即可运行。
# 在临时目录里加载内置的 3 条 hand-curated memory，跑一遍 rules
# pipeline，把生成的 AGENTS.md（Cursor / Codex / Windsurf / Copilot 启动
# 时都会读的那份文件）打印到屏幕，跑完自动清理。
npx ai-memory-cli try

# 设置 API key（任意 OpenAI 兼容提供商）
export AI_REVIEW_API_KEY=sk-...    # 或 OPENAI_API_KEY

# 初始化项目（可选：自动把 ai-memory 注册为 MCP server）
npx ai-memory-cli init --with-mcp

# 一键体检 — 检查编辑器、API key、存储、MCP 配置
npx ai-memory-cli doctor

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

### `try` — 零 API key demo（30 秒看效果）

在临时目录里加载内置的 3 条 hand-curated memory，跑一遍真实的 `rules --target agents-md` pipeline，把生成的 AGENTS.md 直接打印到屏幕。不发 LLM 请求、不需要 API key、不改你的工作目录——只是把"这玩意儿到底产出什么"具体地展示出来，让你在投入配置成本之前先看一眼成品。

```bash
npx ai-memory-cli try                     # 完整 demo，结束后自动清理临时目录
npx ai-memory-cli try --keep              # 保留临时目录便于查看
npx ai-memory-cli try --json              # 结构化输出（含计数 / AGENTS.md 全文 / 路径）
```

内置场景包含 1 条 decision（PKCE 认证流程）、1 条 architecture（事件溯源的计费审计日志）、1 条 convention（Relay 风格的 cursor 分页），来自两位作者。只有 convention 和 decision 会进 AGENTS.md——这跟真实 `rules` 命令对你自己 memory 的过滤逻辑完全一致。

### `doctor` — 一键健康检查

跑过 `try` 之后，如果你决定把 ai-memory 接到真实对话历史上，再跑这个。它会诊断六个最常见的配置问题，并告诉你每一项怎么修。

```bash
npx ai-memory-cli doctor                 # 人类可读报告
npx ai-memory-cli doctor --no-llm-check  # 跳过联网 API 测试（离线 / CI 场景）
npx ai-memory-cli doctor --json          # 结构化输出（便于脚本处理 / 贴到 issue 里）
```

检查项：Node 版本、检测到的编辑器及对话数（Cursor / Claude Code / Windsurf / Copilot / Codex CLI）、LLM 提供商 + 实时连通性探测、记忆存储与作者解析、embeddings 新鲜度、MCP 配置注册情况。全部通过退出码为 `0`，有任何 fail 退出码为 `1`。当未配置 API key 时，`doctor` 现在会指向 `try` 作为零 key 的体验路径。

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
npx ai-memory-cli extract --redact                 # 调用 LLM 前过滤密钥 / PII（v2.5+）
npx ai-memory-cli extract --dry-run                # 预览（不调用 LLM）
npx ai-memory-cli extract --verbose                # 显示 LLM 请求详情
npx ai-memory-cli extract --json                   # JSON 输出（CI 友好）
```

提取结束后会打印质量统计：过滤了多少低质量结果（内容过短或重复标题）。

#### `--redact` — 调用 LLM 前过滤密钥 / PII / 内网域名（v2.5+）

`extract` / `summary` / `context --summarize` 会把对话片段发送给 LLM 服务商。"Local-first" 指的是**存储层**——`.ai-memory/` 是纯 Markdown 文件，我们永远不会上传——但**调用 LLM 这一步**本身必须发起出站 HTTPS 请求。如果你的聊天记录里曾经粘贴过 API key、内部主机名、或客户邮箱，`--redact` 会在请求离开本机之前替换掉这些片段。

```bash
$ ai-memory extract --redact
   ...
Redaction: 5 items scrubbed before LLM (118 chars) — 3 openai-key, 2 email
```

默认启用的 10 条规则：OpenAI / Anthropic / AWS / GitHub / Slack / GCP / Stripe 各家 API key、RFC5322 邮箱、`*.internal` / `*.corp` / `*.local` / `*.lan` / `*.intra` 内部主机名。另有 2 条可选规则（`jwt`、`aws-secret-key`）默认关闭——因为它们对长 base64 字符串的误判率较高；可在 `.ai-memory/.config.json` 中显式启用：

```json
{
  "redact": {
    "enabled": true,
    "enableOptional": ["jwt"],
    "rules": [{ "name": "internal-jira", "pattern": "JIRA-[0-9]{4,}" }]
  }
}
```

命令行优先级高于配置文件：`--no-redact` 永远禁用、`--redact` 永远启用。开启后会**始终**打印审计日志（按规则名分组的命中次数），人类输出和 `--json` 都有；匹配到的真实值**绝不**会被打印，否则就破坏了功能本身的意义。

> **威胁模型说明。** 这是**纵深防御**，**不是**密钥管理替代品。完整策略文档（包含范围外项目：图片附件、对已存在的 `.ai-memory/*.md` 做回溯式脱敏、结构化 PII 保险库式扫描）见 [`docs/redaction-policy-2026-04-26.md`](docs/redaction-policy-2026-04-26.md)。

### `search` — 搜索记忆

```bash
npx ai-memory-cli search "OAuth"                   # 关键词搜索所有记忆
npx ai-memory-cli search "支付" --type decision     # 按类型过滤
npx ai-memory-cli search "auth" --author alice      # 按作者过滤
npx ai-memory-cli search "API" --include-resolved   # 包含已归档的记忆
npx ai-memory-cli search "配置" --json              # JSON 输出
```

结果按相关度排序（标题匹配 > 内容 > 上下文），关键词高亮显示。

### `recall` — 用 git 历史回溯一条记忆

别家"memory"工具都把记忆压平成"最新版本"——每一次更新都默默覆盖之前的版
本。我们因为 `.ai-memory/` 是 git 里的纯 Markdown，*完整演化轨迹*本来就在磁盘
上；`recall` 把它升级成一等命令。

```bash
npx ai-memory-cli recall "OAuth"                   # 看这条 OAuth 决策怎么演化的
npx ai-memory-cli recall "OAuth" --include-resolved # 包含被替代/已归档的版本
npx ai-memory-cli recall "API" --type decision      # 按类型过滤
npx ai-memory-cli recall "auth" --all-authors       # 跨整个团队搜
npx ai-memory-cli recall "OAuth" --json             # 结构化输出（每条记忆 + 其 commit 列表）
```

输出形如：

```
Recall: "OAuth" — 1 memory, 4 commits of lineage

[+] CURRENT  Use OAuth 2.0 PKCE for SPA  @conor (2026-04-20)
    .ai-memory/conor/decisions/2026-04-20-use-oauth-pkce.md
    History (4 commits):
      a1b2c3d  2026-04-20  conor   ~ Tighten OAuth PKCE: require HTTPS-only token endpoint
      e4f5g6h  2026-04-15  conor   ~ Switch from implicit flow to PKCE
      i7j8k9l  2026-03-20  conor   + Add OAuth library notes
    > git log --follow .ai-memory/conor/decisions/2026-04-20-use-oauth-pkce.md  for full diffs
```

- 用 `git log --follow`，所以 `.ai-memory/` 内的文件重命名能透明追踪。
- 每行展示：短 SHA、ISO 日期、作者、状态码（`+` 新增，`~` 修改，`-` 删除，
  `R` 重命名）、commit 标题。
- **软降级** — 不在 git 仓库里、或还没把 `.ai-memory/` 提交时，recall 仍然返
  回匹配的记忆并给出提示。任何场景下都不会比 `search` 差。
- 没有新增运行时依赖 — 直接用系统现有 `git`，`node:child_process.execFile`，
  10 秒超时保护。

### `rules` — 导出 Cursor Rules、AGENTS.md **和** Anthropic Skills

把约定/决策/架构事实同时写到 Cursor 原生规则文件、跨编辑器通用的 `AGENTS.md`，以及 Claude Code 的 Anthropic Skills：

```bash
npx ai-memory-cli rules                            # 默认 .cursor/rules/ai-memory-conventions.mdc
npx ai-memory-cli rules --target agents-md         # AGENTS.md（Codex / Cursor / Windsurf / Copilot / Amp 都读）
npx ai-memory-cli rules --target skills            # Anthropic Skills（Claude Code）— v2.5+
npx ai-memory-cli rules --target both              # Cursor Rules + AGENTS.md 都按默认路径写
npx ai-memory-cli rules --output my-rules.mdc      # 单 target 时自定义输出
npx ai-memory-cli rules --all-authors              # 包含团队所有人的约定
```

`--target agents-md` 采用 **幂等合并**：只更新 `<!-- ai-memory:managed-section
start --> ... end -->` 之间的内容，文件其它手写部分原样保留；同样输入连续两次
执行不会改文件（输出 `already-up-to-date`）；如果 marker 缺失或重复，会报告
冲突并拒绝写入，永远不会破坏你已有的 `AGENTS.md`。

`--target skills` 在 `.claude/skills/` 下生成 [Anthropic Skills](https://docs.anthropic.com/en/docs/claude-code/skills)，按长期记忆类型拆成 3 个 skill：

| Skill | 来源 | 触发场景 |
|---|---|---|
| `.claude/skills/ai-memory-coding-conventions/SKILL.md` | `convention` 记忆 | 写新代码 / 命名变量 / 设计 API |
| `.claude/skills/ai-memory-decision-log/SKILL.md` | `decision` 记忆（status ≠ resolved） | 提出架构变更 / 评估方案 / 被问到历史决策原因 |
| `.claude/skills/ai-memory-system-architecture/SKILL.md` | `architecture` 记忆 | 实现跨组件特性 / 排查集成问题 |

Skills 由 Claude Code **按需动态加载**——根据 YAML frontmatter `description` 与你请求的匹配度决定。和 AGENTS.md（永远在 context 里）不同，Skill body 只有在被激活时才进入 context。我们对齐的 schema 版本（2026-04-26 冻结）记录在 [`docs/skills-schema-snapshot-2026-04-26.md`](docs/skills-schema-snapshot-2026-04-26.md)。`ai-memory-` 前缀是 owership 信号：`.claude/skills/ai-memory-*/` 下的内容每次都被**完整重写**；用户自己的 skill 放在其他目录名下不会受影响。

这就是 **对话到规则的闭环** — 从聊天历史提取约定，自动生成所有 AI 编辑器都能读的规则文件。**没有任何其他工具能从单一聊天历史输入同时产出 Cursor Rules + AGENTS.md + Anthropic Skills 三种格式。**

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

### `link` — 把 memory 关联到实现它的 git commit（v2.6）

```bash
npx ai-memory-cli link                             # 扫描近 30 天的 commit
npx ai-memory-cli link --since "7 days ago"        # 自定义时间窗口
npx ai-memory-cli link --dry-run                   # 预览，不写文件
npx ai-memory-cli link --clear-auto                # 删除所有自动关联的链接
```

扫描 git log，对每对 (memory, commit) 用加权 Jaccard 打分：memory title×3 + type×2 + content×1 vs commit subject×3 + 改动路径×2 + body×1。高置信度匹配（score ≥ 0.70）写入 memory 文件的 HTML 注释块，Dashboard 可以展示。默认阈值偏保守——错误链接比不链接代价更高。

### `init` — 初始化配置

```bash
npx ai-memory-cli init                             # 检测编辑器、创建配置
npx ai-memory-cli init --with-mcp                  # 同时把 ai-memory 注册为 MCP server
npx ai-memory-cli init --schedule                  # 注册每日 extract --incremental 定时任务
npx ai-memory-cli init --unschedule                # 删除定时任务
```

自动检测编辑器，创建 `.ai-memory/.config.json`，并将 `.state.json` 加入 `.gitignore`。

加上 `--with-mcp` 时，会生成/合并 `.cursor/mcp.json` 与 `.windsurf/mcp.json`，幂等安全。加上 `--schedule` 时，在 macOS（launchd）、Linux（crontab）或 Windows（Task Scheduler）注册每天 09:00 自动执行的定时提取任务——再也不用手动 `extract`。

### `dashboard` — 可视化面板

在本地浏览器中浏览、搜索和可视化你的知识库：

```bash
npx ai-memory-cli dashboard                       # 打开 http://localhost:3141
npx ai-memory-cli dashboard --port 8080            # 自定义端口
```

包含：
- **总览页** — 统计卡片、月度时间线、作者分布、最近活动
- **记忆浏览器** — 实时搜索、按类型/作者/状态过滤、点击查看详情
- **知识图谱** — D3.js 力导向图，节点按类型着色，边连接同一对话来源或共享关键词
- **导出** — JSON、Obsidian（含 YAML frontmatter）、剪贴板

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

## MCP Server（新功能）

ai-memory 可以作为 **MCP Server** 运行，让 AI 编辑器（Cursor、Claude Code）直接访问你的知识库 — 无需手动执行命令。

### 配置

在 Cursor MCP 配置中添加（`.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "ai-memory": {
      "command": "npx",
      "args": ["ai-memory-cli", "serve"]
    }
  }
}
```

### AI 获得的能力

| MCP 能力 | 功能 |
|---|---|
| `remember` 工具 | AI 在对话中主动存储决策/约定/待办（自动生成嵌入索引） |
| `recall` 工具 | AI 使用语义+关键词混合搜索检索相关记忆 |
| `search_memories` 工具 | 完整搜索，支持类型/作者/归档过滤，语义感知 |
| `project-context` 资源 | 开始对话时自动提供项目上下文 |

配置完成后，AI 会自动记住重要决策并在未来的会话中召回 — 不需要你执行任何命令。

### 语义搜索

ai-memory 使用**混合搜索**，结合语义相似度（嵌入向量）、关键词匹配和时间衰减。你可以按语义搜索，而不仅仅是精确关键词。

```bash
# 构建搜索索引（使用已配置的 LLM API 生成嵌入）
npx ai-memory-cli reindex

# 语义搜索 — "数据库选型" 能找到 "PostgreSQL 决策"
npx ai-memory-cli search "数据库选型"
```

MCP 的 `recall` 和 `search_memories` 工具自动使用混合搜索。嵌入向量存储在本地的 `.ai-memory/.embeddings.json`，使用 `remember` 工具时自动索引。

### 手动启动（用于测试）

```bash
npx ai-memory-cli serve           # 启动 MCP server
npx ai-memory-cli serve --debug   # 带调试日志
```

---

## Watch 模式（新功能）

对话发生变化时自动提取知识 — 零手动操作：

```bash
npx ai-memory-cli watch
```

Watch 模式监控所有检测到的来源，发现新对话活动时自动运行提取。使用文件系统事件（Cursor/Claude Code）和定期轮询（所有来源）来检测变化。

```
ai-memory watch — auto-extract on conversation changes

   Author: conor
   Output: .ai-memory/
   [+] Watching: Cursor
   [+] Watching: Claude Code

Initial scan complete — watching for changes...

10:15:32 [Cursor] "OAuth 重构讨论" (+8 turns) — extracting...
10:15:37 [+] 2 decision, 1 convention
```

按 `Ctrl+C` 停止。

---

## 本地 LLM 支持（新功能）

使用 Ollama 或 LM Studio 替代云 API — **无需 API key**：

### Ollama

```bash
# 安装 Ollama: https://ollama.ai
ollama pull llama3.2              # 下载模型
ollama pull nomic-embed-text      # （可选）用于语义搜索

export OLLAMA_HOST=http://localhost:11434
export OLLAMA_MODEL=llama3.2      # 提取用模型
npx ai-memory-cli extract
```

### LM Studio

```bash
# 启动 LM Studio 并加载一个模型
export LM_STUDIO_BASE_URL=http://localhost:1234/v1
export LM_STUDIO_MODEL=your-model-name
npx ai-memory-cli extract
```

云 API key 始终优先于本地 LLM。如果设置了 `OPENAI_API_KEY` 或 `AI_REVIEW_API_KEY`，将优先使用云端。

| 变量 | 说明 |
|------|------|
| `OLLAMA_HOST` | Ollama 服务地址（默认：`http://localhost:11434`） |
| `OLLAMA_MODEL` | 提取用模型（默认：`llama3.2`） |
| `OLLAMA_EMBEDDING_MODEL` | 语义搜索用模型（默认：`nomic-embed-text`） |
| `LM_STUDIO_BASE_URL` | LM Studio 服务地址（默认：`http://localhost:1234/v1`） |
| `LM_STUDIO_MODEL` | 模型名称 |

---

## 支持的来源

| 来源                  | 数据位置                                                       | 状态   |
| --------------------- | -------------------------------------------------------------- | ------ |
| **Cursor**      | `~/.cursor/projects/{name}/agent-transcripts/`               | 已支持 |
| **Claude Code** | `~/.claude/projects/{path}/*.jsonl`                          | 已支持 |
| **Windsurf**    | `~/AppData/Windsurf/User/workspaceStorage/*/state.vscdb`     | Beta   |
| **VS Code Copilot** | `~/AppData/Code/User/workspaceStorage/*/chatSessions/*.json` | Beta   |
| **Codex CLI**   | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`               | Beta — v2.5+ |

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
    "claudeCode": { "enabled": true },
    "windsurf": { "enabled": true },
    "copilot": { "enabled": true }
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

| 变量                   | 说明                                            |
| ---------------------- | ----------------------------------------------- |
| `AI_REVIEW_API_KEY`  | API key（推荐，与 ai-review-pipeline 共用）     |
| `OPENAI_API_KEY`     | OpenAI API key                                  |
| `OPENAI_BASE_URL`    | 自定义 OpenAI 兼容 API 地址                     |
| `OPENAI_MODEL`       | OpenAI 模型覆盖                                 |
| `ANTHROPIC_API_KEY`  | Anthropic API key（需兼容代理）                 |
| `ANTHROPIC_BASE_URL` | Anthropic 代理地址                              |
| `AI_REVIEW_BASE_URL` | 自定义 API 地址                                 |
| `AI_REVIEW_MODEL`    | 使用的模型（默认：`gpt-4o-mini`）             |
| `OLLAMA_HOST`        | Ollama 服务地址（默认：`http://localhost:11434`）|
| `OLLAMA_MODEL`       | Ollama 提取用模型                               |
| `OLLAMA_EMBEDDING_MODEL` | Ollama 语义搜索嵌入模型                     |
| `LM_STUDIO_BASE_URL` | LM Studio API 地址                              |
| `LM_STUDIO_MODEL`    | LM Studio 模型名称                              |

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
- 任意 OpenAI 兼容提供商的 API key，**或**本地 LLM（Ollama / LM Studio）

> **提示：** Node.js 22+ 可通过读取 Cursor/Windsurf 数据库获取更准确的对话标题。Node 18-20 会从首条消息提取标题（正常使用不受影响）。

## License

MIT — [Conor Liu](https://github.com/hyxnj666-creator)
