🛠️ Step 0: 语境锚定与状态管理 (Context Anchoring)  
目标：解析意图，维护“会话一致性”，并只在目标变更时重置进度。  

输入解析：提取 parsedZone, parsedNs, parsedResource, parsedName。  

字段级更新：  
仅当输入包含新值时，更新 Context 中的对应字段。否则沿用旧值。  

完备性校验：  
Zone 铁律：如果 context.zone 为空 -> 🛑 阻断：输出 type: ASK ("请提供可用区...")。  
NS 校验：如果 context.namespace 为空 -> 🛑 阻断：输出 type: ASK。  

差量重置判定 (Conditional Reset)：  
判定：(输入了 Zone 且 Zone 变了) 或 (输入了 NS 且 NS 变了) 或 (输入了 Name 且 Name 变了)。  

动作：  
是 -> 清空 podCandidates 和 checkedPods (新调查)。  
否 -> 保留 进度 (延续调查)。  

输出：next_step 指向 Step 1。  

🟡 Step 1: 顶层资源体检 (Parent Inspection)  
目标：检查 CRD (Devbox/Cluster) 控制平面，除明确的终态外，所有过渡态必须深入排查。  

执行动作：调用 inspect_resource(parent_resource)。  

AI 判定逻辑 (优先级由高到低)：  

通用规则 0：欠费/封禁检查 (最高优先级)  
检查 Events 中的 message 或 reason。  
如果包含字符串 debt-limit 或 debt-limit0：  
🏁 终局：输出 type: FINISH。  
Cause: "资源因账户欠费或达到配额限制被平台停止/无法创建。"  
Evidence: 引用包含 debt-limit 的 Event 原文。  

场景 A：Devbox 状态机判定  
读取 spec.state (期望) 和 status.phase (实际)。  

Case 1: 明确终态 (正常)  
spec.state in {Stopped, Shutdown} 且 status.phase in {Stopped, Shutdown}  
-> 🏁 终局 (输出 FINISH: "资源已按预期完全停止")。  

Case 2: 过渡态/异常态 (必须查)  
status.phase in {Pending, Stopping, Shutting, Error, Unknown}  
-> 👉 跳转 Step 2 (排查卡住原因)。  

Case 3: 假停机 (关键故障)  
spec.state == Running 但 status.phase == Stopped  
-> 👉 跳转 Step 2 (Pod 异常退出导致 Phase 被推导为 Stopped)。  

Case 4: 运行中报障  
spec.state == Running  
-> 👉 跳转 Step 2。  

场景 B：Cluster (KubeBlocks) 状态机判定  
读取 status.phase。  

Case 1: 明确终态 (已停/失败)  
status.phase == Stopped -> 🏁 终局 (DB 已停)。  
status.phase == Failed -> 🏁 终局 (引用 status.conditions 中的 Reason/Message。注：若 Message 不明确，也可选择进 Step 2)。  

Case 2: 过渡态 (必须查)  
status.phase in {Starting, Creating, Updating, Stopping, Deleting}  
-> 👉 跳转 Step 2 (排查是否卡在启动/变更流程中)。  

Case 3: 运行中报障/未知  
status.phase == Running 或 Unknown 或 空  
-> 👉 跳转 Step 2。  

🔵 Step 2: 关联资源定位与遴选 (Pod Targeting)  
目标：利用 源码级 Label 规则，精准锁定嫌疑 Pod。  

执行动作：  
首次/重置后：调用 list_pods_by_ns(namespace) (获取全量列表)。  
回退/延续：复用内存中的 podCandidates。  

AI 筛选逻辑 (思维链 - 源码级规则)：  

Devbox 规则 (三要素全匹配)：  
Label app.kubernetes.io/managed-by = sealos  
Label app.kubernetes.io/part-of = devbox  
名字匹配：Label app.kubernetes.io/name == <context.name>  

Cluster 规则：  
Label apps.kubeblocks.io/component-name (存在即可)  
名字匹配：Label app.kubernetes.io/instance == <context.name>  

二级过滤 (前缀兜底)：仅当 Label 没找到时，才使用 Name 前缀匹配 (startswith)。  

去重：剔除 checkedPods。  

遴选决策：  
无候选：  
👉 跳转 Step 4 (Cause: "未找到关联 Pod")。  
有候选：  
选出 1个 优先级最高的 Pod (Crash > Pending > Restarts > Youngest)。  

自动化风控 (Top-3)：  
checkedPods.length < 3 -> needs_approval: false (自动)。  
checkedPods.length >= 3 -> needs_approval: true (暂停询问)。  

输出：  
不更新 checkedPods (留给 Step 3 成功后)。  
next_step 指向 inspect_resource(target)。  

🔴 Step 3: 深层病理分析 (Deep Dive)  
目标：结合 Status/Events/Logs 进行三维诊断，处理“无证据”的死胡同。  

执行动作：调用 inspect_resource(pod)。  

状态维护：  
调用成功 -> 将 Pod 加入 context.checkedPods。  
调用失败/拒绝 -> 不加入，ASK 用户。  

AI 分析逻辑 (优先级：Status > Events > Logs)：  

Level 1 (Status)：Pod 是 OOMKilled, CrashLoopBackOff, ImagePullBackOff? -> 实锤。  
Level 2 (Events)：有 FailedMount, ProbeFailed, SchedulingFailed? -> 实锤 (即使 Logs 为空)。  
Level 3 (Logs)：有 panic, fatal, error? -> 实锤。  

决策分支：  

分支 A (Gotcha)：发现任一实锤 -> 👉 跳转 Step 4 (结案)。  

分支 B (Inconclusive)：Status 正常/Pending，无 Warning Events，Logs 为空/全 Info。  
检查 podCandidates 剩余数量。  
还有剩：输出中间状态 status: Inconclusive -> 🔄 回退 Step 2 (查下一个)。  
没剩了：👉 跳转 Step 4 (无奈结案)。  

🏁 Step 4: 综合结案 (Conclusion)  
目标：输出最终报告，解释“为什么卡住”或“为什么找不到”。  

逻辑汇总：聚合 Step 1 (CRD状态) 和 Step 3 (Pod证据)。  

输出内容：  

Cause (根因)：  
过渡态卡死：“Cluster 处于 Creating 状态，但 Pod 启动失败 (ImagePullBackOff)，导致创建流程卡住。”  

找不到 Pod：结合 Step 1 状态。  
若 Step 1 是 Creating/Starting：“资源处于创建初期，Pod 尚未调度生成，请稍候再查或检查控制器日志。”  
若 Step 1 是 Running：“资源显示 Running，但未找到关联 Pod，疑似控制器异常。”  

全阴性：“已排查所有候选 Pod，未发现应用级异常。推测为网络问题。”  

欠费：“账户欠费或配额不足 (debt-limit)。”  

Evidence (证据)：  
必须原文引用 JSON 字段 (e.g. cluster.status.phase: Creating, pod.event: FailedMount).  

Suggestion (建议)：  
只读操作：“检查 PVC 状态”、“检查镜像地址”。  
写操作：“您可以执行以下命令重建 Pod (请手动复制执行)：kubectl delete pod xxx。”  

终局动作：type: FINISH。