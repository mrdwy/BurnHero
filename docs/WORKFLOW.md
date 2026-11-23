# 开发流程（issue → PR → 验收 → 合并）

```
发现 bug / 新需求
   │  Claude 按模板建 issue（含验收标准、标签 status:ready + 优先级）
   ▼
Codex 领取 → status:in-progress → 分支 <type>/<N>-xxx → 开发 + 自测
   │  提 PR（Closes #N，逐条对照验收标准）→ status:review
   ▼
Claude 验收：读 diff + 在本机拉分支跑 typecheck/build/Playwright + 对照验收标准
   ├─ 不通过 → PR 评论逐条写问题 → status:changes-requested → Codex 同分支修改
   └─ 通过   → PR 里写「验收通过」并 Approve
   ▼
A6 合并 PR（Squash merge）→ GitHub 自动关闭 issue → 删除分支
```

## 规则

- 合并方式：Squash merge，合并后的标题保留 `(#N)`，`main` 每个提交对应一个 issue。
- 合并人：A6。以后 A6 明确授权后，Claude 可以在验收通过后代为合并。
- 被拒绝 / 不做的 issue：Claude 写明原因后手动关闭，选择 "Close as not planned"。
- 版本发布：攒够功能后打 tag `v0.x.y`，Windows 便携包和 APK 上传到 GitHub Releases，不进仓库。

## 标签（首次建仓库后创建一次）

| 标签 | 颜色 | 用途 |
|---|---|---|
| type:bug | d73a4a | 缺陷 |
| type:feature | 0e8a16 | 新功能 |
| type:chore | c5def5 | 工程/依赖/配置 |
| type:docs | 0075ca | 文档 |
| P0 / P1 / P2 | b60205 / d93f0b / fbca04 | 优先级 |
| status:ready | ededed | 可以领取 |
| status:in-progress | 1d76db | 开发中 |
| status:review | 5319e7 | 等待验收 |
| status:changes-requested | e99695 | 验收不过，待修改 |
| area:ui / game / llm / data / build | bfdadc | 模块 |
