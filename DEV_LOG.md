# Sealos SRE Agent (v2.0) 开发日志

## 日期: 2025-12-08

## 当前任务
1. **初始化项目骨架** - 创建项目基础文件和目录结构
2. **验证乱序参数清洗逻辑** - 实现并测试参数解析功能

## 项目概述
Sealos SRE Agent (v2.0) 是一个基于 MCP (Model Context Protocol) 协议的智能运维代理，专门用于 Kubernetes 集群管理。

## 技术栈
- **协议**: MCP (Model Context Protocol)
- **运行时**: Node.js (ES2022)
- **语言**: TypeScript
- **容器编排**: Kubernetes
- **配置管理**: Sealos
- **依赖包**:
  - @modelcontextprotocol/sdk
  - @kubernetes/client-node
  - zod
  - typescript
  - ts-node

## 当前进展
- ✅ 项目基础配置已完成 (package.json, tsconfig.json)
- ✅ Kubernetes 配置文件已准备 (kubeconfig/Mykubeconfig)
- ⏳ 开始实现 MCP 服务器和客户端功能

## 实现目标
创建一个垂直切片，实现：
1. MCP 服务器端：提供 K8s Pod 查询工具
2. 客户端：处理乱序参数并调用服务器工具
3. 完整的端到端测试验证

## 开发备注
- 服务器必须使用 console.error 输出执行日志
- 客户端需要能够处理 ["ns", "hzh", "pods"] 这样的乱序参数
- 最终输出应该是结构化的 JSON 格式