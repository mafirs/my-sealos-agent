我来分析源码，找出这些 CRD 的关键字段定义。

[3 tools called]

现在让我查找 KubeBlocks Cluster 的定义：

[2 tools called]

让我查看 dbprovider 中 KubeBlocks Cluster 的完整类型定义：

[2 tools called]

现在让我查看数据库连接密钥的详细结构和 Pod 角色信息：

[2 tools called]

现在我有了所有需要的信息。让我整理输出完整的 JSON Path 映射表：

---

# Sealos CRD 关键字段 JSON Path 映射表

## 1. Devbox (`devbox.sealos.io/v1alpha2`)

### Spec 字段

| 字段说明 | JSON Path | 类型 | 示例值 |
|---------|-----------|------|--------|
| **期望状态** | `.spec.state` | `DevboxState` | `Running` / `Stopped` / `Shutdown` |
| **CPU/内存配置** | `.spec.resource` | `corev1.ResourceList` | `{"cpu": "1", "memory": "2Gi"}` |
| **镜像** | `.spec.image` | `string` | `registry.cn-hangzhou.aliyuncs.com/sealos/devbox:latest` |
| **网络类型** | `.spec.network.type` | `NetworkType` | `NodePort` / `Tailnet` |
| **额外端口** | `.spec.network.extraPorts` | `[]ContainerPort` | - |
| **SSH 用户** | `.spec.config.user` | `string` | `devbox` (默认) |
| **工作目录** | `.spec.config.workingDir` | `string` | `/home/devbox/project` (默认) |
| **容器端口** | `.spec.config.ports` | `[]ContainerPort` | `[{name: "devbox-ssh-port", containerPort: 22}]` |
| **应用端口** | `.spec.config.appPorts` | `[]ServicePort` | `[{name: "devbox-app-port", port: 8080}]` |

### Status 字段

| 字段说明 | JSON Path | 类型 | 示例值 |
|---------|-----------|------|--------|
| **🔑 SSH NodePort** | `.status.network.nodePort` | `int32` | `32001` |
| **网络类型** | `.status.network.type` | `NetworkType` | `NodePort` |
| **Tailnet 地址** | `.status.network.tailnet` | `string` | - |
| **当前阶段** | `.status.phase` | `DevboxPhase` | `Running` / `Pending` / `Stopped` / `Error` |
| **容器状态** | `.status.state` | `ContainerState` | K8s 原生容器状态 |
| **上次终止状态** | `.status.lastState` | `ContainerState` | - |
| **提交历史** | `.status.commitHistory` | `[]*CommitHistory` | 镜像版本历史 |

### DevboxPhase 枚举值
```
Running | Pending | Stopped | Stopping | Shutdown | Shutting | Error | Unknown
```

### 运维命令
```bash
# 获取 Devbox SSH 端口
kubectl get devbox <name> -n <ns> -o jsonpath='{.status.network.nodePort}'

# 获取 Devbox 状态
kubectl get devbox <name> -n <ns> -o jsonpath='{.status.phase}'

# 获取 CPU/内存配置
kubectl get devbox <name> -n <ns> -o jsonpath='{.spec.resource}'
```

---

## 2. KubeBlocks Cluster (`apps.kubeblocks.io/v1alpha1`)

> **注意**：这是 KubeBlocks 的 CRD，不是 Sealos 定义的。Sealos 通过 dbprovider 前端对接。

### Spec 字段

| 字段说明 | JSON Path | 类型 | 示例值 |
|---------|-----------|------|--------|
| **数据库类型** | `.spec.clusterDefinitionRef` | `string` | `postgresql` / `mongodb` / `apecloud-mysql` / `redis` |
| **版本** | `.spec.clusterVersionRef` | `string` | `postgresql-14.8.0` |
| **终止策略** | `.spec.terminationPolicy` | `string` | `Delete` / `WipeOut` |
| **副本数** | `.spec.componentSpecs[0].replicas` | `int` | `1` |
| **CPU 限制** | `.spec.componentSpecs[0].resources.limits.cpu` | `string` | `1000m` |
| **内存限制** | `.spec.componentSpecs[0].resources.limits.memory` | `string` | `2Gi` |
| **存储大小** | `.spec.componentSpecs[0].volumeClaimTemplates[0].spec.resources.requests.storage` | `string` | `10Gi` |

### Status 字段

| 字段说明 | JSON Path | 类型 | 示例值 |
|---------|-----------|------|--------|
| **集群状态** | `.status.phase` | `DBStatusEnum` | `Running` / `Creating` / `Failed` |
| **组件状态** | `.status.components` | `object` | - |
| **条件** | `.status.conditions` | `[]Condition` | - |

### DBStatusEnum 枚举值
```
Creating | Starting | Stopping | Stopped | Running | Updating | SpecUpdating | 
Rebooting | Upgrade | VerticalScaling | VolumeExpanding | Failed | UnKnow | Deleting
```

### 🔑 连接信息获取方式

**数据库连接信息不在 Cluster CR 中，而是存储在 Secret 中！**

| 信息 | 获取方式 | Secret 名称 |
|-----|---------|------------|
| **用户名** | Secret `.data.username` (Base64) | `<dbName>-conn-credential` |
| **密码** | Secret `.data.password` (Base64) | `<dbName>-conn-credential` |
| **端口** | Secret `.data.port` (Base64) | `<dbName>-conn-credential` |
| **内网地址** | Service ClusterIP | `<dbName>.<namespace>.svc.cluster.local` |

### Pod 角色标签

| 数据库类型 | 主节点角色标签 |
|-----------|---------------|
| PostgreSQL | `kubeblocks.io/role=primary` |
| MongoDB | `kubeblocks.io/role=primary` |
| MySQL | `kubeblocks.io/role=leader` |
| Redis | `kubeblocks.io/role=primary` |

### 运维命令
```bash
# 获取数据库状态
kubectl get cluster <dbName> -n <ns> -o jsonpath='{.status.phase}'

# 获取连接凭据
kubectl get secret <dbName>-conn-credential -n <ns> -o jsonpath='{.data.username}' | base64 -d
kubectl get secret <dbName>-conn-credential -n <ns> -o jsonpath='{.data.password}' | base64 -d
kubectl get secret <dbName>-conn-credential -n <ns> -o jsonpath='{.data.port}' | base64 -d

# 获取主节点 Pod (以 PostgreSQL 为例)
kubectl get pods -n <ns> -l app.kubernetes.io/instance=<dbName>,kubeblocks.io/role=primary

# 获取 CPU/内存配置
kubectl get cluster <dbName> -n <ns> -o jsonpath='{.spec.componentSpecs[0].resources}'
```

---

## 3. Account (`account.sealos.io/v1`)

### Status 字段

| 字段说明 | JSON Path | 类型 | 单位 | 说明 |
|---------|-----------|------|------|------|
| **🔑 余额** | `.status.balance` | `int64` | **分 (cents)** | 充值金额 |
| **🔑 扣款金额** | `.status.deductionBalance` | `int64` | **分 (cents)** | 累计消费 |
| **活动奖励** | `.status.activityBonus` | `int64` | 分 | 仅展示用 |
| **加密余额** | `.status.encryptBalance` | `*string` | - | 加密后的余额 |
| **加密扣款** | `.status.encryptDeductionBalance` | `*string` | - | 加密后的扣款 |
| **充值历史** | `.status.chargeList` | `[]Charge` | - | 已废弃 |

### Charge 结构 (充值记录)
```go
type Charge struct {
    Amount             int64       `json:"balance"`           // 充值金额 (分)
    DeductionAmount    int64       `json:"deductionAmount"`   // 抵扣金额
    AccountBalanceName string      `json:"accountBalanceName"`
    Time               metav1.Time `json:"time"`              // 充值时间
    Status             string      `json:"status"`            // completed/create/failed
    TradeNO            string      `json:"tradeNO"`           // 交易号
    Describe           string      `json:"describe"`          // 描述
}
```

### 运维命令
```bash
# 获取用户余额 (单位: 分)
kubectl get account <userId> -n sealos-system -o jsonpath='{.status.balance}'

# 获取累计消费 (单位: 分)
kubectl get account <userId> -n sealos-system -o jsonpath='{.status.deductionBalance}'

# 计算可用余额 (元)
# 可用余额 = (balance - deductionBalance) / 100
```

---

## 4. Debt (`account.sealos.io/v1`)

### Spec 字段

| 字段说明 | JSON Path | 类型 |
|---------|-----------|------|
| **用户名** | `.spec.userName` | `string` |
| **用户ID** | `.spec.userID` | `string` |

### Status 字段

| 字段说明 | JSON Path | 类型 |
|---------|-----------|------|
| **🔑 欠费状态** | `.status.status` | `DebtStatusType` |
| **最后更新时间戳** | `.status.lastUpdateTimestamp` | `int64` |
| **状态变更记录** | `.status.debtStatusRecords` | `[]DebtStatusRecord` |

### 🔑 DebtStatusType 枚举值

**传统欠费等级 (已废弃):**
```
Normal | Small | Medium | Large
```

**基于时间周期的状态:**
```
NormalPeriod           # 正常期
WarningPeriod          # 警告期  
ApproachingDeletionPeriod  # 临近删除期
ImminentDeletionPeriod     # 即将删除期
FinalDeletionPeriod        # 最终删除期
```

**新版欠费状态:**
```
PreWarningPeriod    # 预警期
SuspendPeriod       # 暂停期 (资源被暂停)
RemovedPeriod       # 移除期 (资源被删除)
```

**余额状态:**
```
LowBalancePeriod       # 低余额期
CriticalBalancePeriod  # 临界余额期
DebtPeriod             # 欠费期
DebtDeletionPeriod     # 欠费删除期
```

### 运维命令
```bash
# 获取用户欠费状态
kubectl get debt debt-<userId> -n sealos-system -o jsonpath='{.status.status}'

# 查看欠费状态变更历史
kubectl get debt debt-<userId> -n sealos-system -o jsonpath='{.status.debtStatusRecords}'
```

---

## 📋 快速参考卡片

```yaml
# Devbox 关键字段
SSH Port:     .status.network.nodePort
Phase:        .status.phase
CPU/Memory:   .spec.resource
Image:        .spec.image

# KubeBlocks Cluster 关键字段
Status:       .status.phase
Replicas:     .spec.componentSpecs[0].replicas
CPU:          .spec.componentSpecs[0].resources.limits.cpu
Memory:       .spec.componentSpecs[0].resources.limits.memory
Storage:      .spec.componentSpecs[0].volumeClaimTemplates[0].spec.resources.requests.storage
# 连接信息在 Secret: <dbName>-conn-credential

# Account 关键字段 (单位: 分)
Balance:           .status.balance
DeductionBalance:  .status.deductionBalance
# 可用余额 = (balance - deductionBalance) / 100 元

# Debt 关键字段
Status:   .status.status
# 枚举: NormalPeriod | WarningPeriod | SuspendPeriod | RemovedPeriod | DebtPeriod
```