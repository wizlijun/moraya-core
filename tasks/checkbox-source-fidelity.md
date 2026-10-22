# Rich checkbox 源保真修复（2026-10-22）

- [x] 复现：checked 的原生 ReplaceAroundStep 被视为结构改动；含脚注/链接定义的文档遭到 unsupported-step 拒绝，嵌套表格可能 semantic-mismatch。
- [x] Spec：只允许原生 checked-only 步骤链；源范围来自实际 parser 消费的 checkbox token，并绑定最终 list_item 位置与原始 session。只修改状态字符，保留所有其他原始字节；仍以目标 PM 文档严格回读验证。混合步骤继续既有准入。
- [x] 新增回归，确认 RED：最初 10 项中 8 项失败、2 项通过。
- [x] 实现私有捕获与精准补丁。
- [x] 验证：13 项 checkbox 源保真测试通过；完整 69 文件、1649 项测试通过；`tsc --noEmit` 与 `git diff --check` 通过。tsup 构建通过；宿主安装 dist 的 64 文件清单及字节全部一致，旧 hash DTS 经字节核对后精确移除。

回顾：真实文档只读缩减得到匿名最小复现 `- [ ] A\n\n[^a]: note\n[^b]: note\n`。相邻脚注定义触发结构分隔的保守准入；精确状态字符补丁无需申请无关源码范围。回归覆盖原生 ReplaceAroundStep/AttrStep、父子任务与跨根批量切换、大小写和原始格式、净空变更、混合步骤不获新权限、捕获记录不可移植、撤销所需精确补丁。未修改用户文档。

源码、回归、未发布日志与 dist 一并精确提交；宿主验证报告记录对应提交号。本轮未安装、未发布。
