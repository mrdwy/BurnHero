# AGENTS.md · 燃脂勇者 开发规范（给 Codex）

> 本文件放在仓库根目录，Codex 每次进仓库会自动读取。所有开发工作必须遵守。
> 有冲突时优先级：A6 在 issue/PR 里的直接指示 > 本文件 > 你的默认习惯。

## 1. 角色分工

| 角色 | 负责 |
|---|---|
| A6（仓库主人） | 定需求优先级、最终决定、**合并 PR** |
| Claude | 写 issue（含验收标准）、**验收 PR**、验收不过时写修改意见 |
| Codex（你） | 领取 issue → 开分支 → 开发 → 自测 → 提 PR → 按验收意见修改 |

你**不能**：合并 PR、直接推送 `main`、关闭 issue、改别人的分支、`git push --force` 到 `main`。

## 2. 项目速览

- 网页版在 `web/`：Vite + React 18 + TypeScript，数据存 localStorage，以后打包安卓。
- 设计规范：`design/STYLE_GUIDE.md`（色板、像素风）、`design/AI_INTERACTION.md`；设计稿 `design/mockups/`。
- 方案文档在 `docs/`。issue 里引用了文档就以文档为准，没写的不要自己发挥，在 PR 里提出来。
- 命令（都在 `web/` 下执行）：`npm ci`、`npm run dev`、`npm run typecheck`、`npm run build`、`npm start`。

## 3. 一个 issue 的完整流程

1. **领取**：只做 `status:ready` 的 issue。先读 issue 全文和所有评论：
   `gh issue view <N> --comments`
   开工时给 issue 评论「开始处理，分支 `<分支名>`」，并把标签换成 `status:in-progress`：
   `gh issue edit <N> --remove-label status:ready --add-label status:in-progress`
   需求有歧义或做不到时，**先在 issue 评论提问再动手**，不要猜。
2. **开分支**：从最新 `main` 拉：
   ```bash
   git switch main && git pull --ff-only
   git switch -c <type>/<N>-<简短英文描述>
   ```
3. **开发**：只改与该 issue 有关的文件，不顺手重构、不改格式化风格、不升级依赖（除非 issue 要求）。
4. **自测**（见第 6 节），证据放 `review/issue-<N>/`（该目录已被 gitignore，不要提交）。
5. **提交并推送**：小步提交，提交信息按第 5 节格式。`git push -u origin <分支名>`
6. **提 PR**：按 `.github/pull_request_template.md` 填写，正文必须有 `Closes #<N>`，并把 issue 的每条验收标准逐条对照写结果。
   `gh pr create --base main --title "<同提交格式>" --body-file <文件>`
   然后把 issue 标签换成 `status:review`。
7. **验收修改**：Claude 在 PR 里给意见、标 `status:changes-requested` 时，在**同一分支**追加提交（不要新开 PR，不要 force push 改写已评审的提交），改完在 PR 里回复每条意见怎么处理的，再把标签换回 `status:review`。
8. **合并与关闭**：A6 合并 PR 后 GitHub 根据 `Closes #N` 自动关闭 issue。你不需要也不应该手动关 issue。

一个 PR 只解决一个 issue。issue 太大时在 issue 里建议拆分，等 Claude/A6 拆好再做。

## 4. 分支命名

`<type>/<issue编号>-<kebab-case英文描述>`，例如：

- `fix/12-water-cup-overflow`
- `feat/15-metric-dictionary`
- `chore/3-add-vitest`

type 只能是：`feat` `fix` `refactor` `perf` `test` `docs` `chore` `style`(只改样式，不改逻辑)。

## 5. 提交信息（Conventional Commits）

```
<type>(<scope>): <中文简述，不超过 50 字> (#<issue编号>)

<可选正文：为什么改、怎么改、影响范围>
```

- scope 用模块名：`ui` `game` `llm` `store` `record` `plan` `guild` `build` `docs` 等。
- 例：`fix(record): 喝水满 8 杯后按钮不再溢出 (#12)`
- 一个提交只做一件事；不要出现 `update`、`fix bug`、`wip` 这类没信息的提交。
- 改了 localStorage 数据结构时，正文必须写明迁移方式；破坏兼容的改动在 type 后加 `!`，例如 `feat(store)!: ...`。

## 6. 测试要求（每个 PR 都必须满足）

1. `npm run typecheck` 和 `npm run build` 零错误。
2. 有纯逻辑改动（`game.ts`、`validate.ts`、数值/算法、存储迁移）时写单元测试。仓库还没有测试框架时，第一个需要测试的 issue 里加 Vitest，脚本名 `npm test`。
3. 有界面改动时用 Playwright 在 **375×812、360×740、1280×800** 三个视口截图（deviceScaleFactor 2），每轮先清空 localStorage；截图放 `review/issue-<N>/`，PR 里列出截了哪些页面、发现了什么。
4. 数据兼容：用改动前版本生成的 localStorage 数据打开新版本，角色、奖励、记录不能丢。
5. 不调用真实大模型 API，不在代码、日志、截图、PR 里出现任何 API Key。测试用 mock。
6. PR 里如实写结果。没测的写「未测 + 原因」，测试失败不要说通过。

## 7. 禁止事项

- 不提交：`.env*`、密钥、`node_modules/`、`dist/`、`release/`、`review/`、大于 5MB 的文件（发布包放 GitHub Releases）。
- 不改 `.github/`、`AGENTS.md`、`design/` 下的规范文件，除非 issue 明确要求。
- 不删除或跳过测试来让检查通过。
- 不动 `main` 的历史（不 rebase/force push `main`）。
- 遇到 issue 没覆盖的设计取舍（交互、数值、文案），在 PR「风险与未完成项」或 issue 评论里提出，不要自作主张。

## 8. 标签含义

- 类型：`type:bug` `type:feature` `type:chore` `type:docs`
- 优先级：`P0`（阻断，先做）`P1`（本轮要做）`P2`（有空再做）
- 状态：`status:ready` → `status:in-progress` → `status:review` ⇄ `status:changes-requested`
- 模块：`area:ui` `area:game` `area:llm` `area:data` `area:build`

同时有多个 `status:ready` 时，先做 `P0`，再 `P1`，同级按编号从小到大。
