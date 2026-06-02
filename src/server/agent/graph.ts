import * as dotenv from "dotenv";
dotenv.config(); // 1. 加载 .env

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { inspect } from 'util';
import * as k8s from '@kubernetes/client-node';
import { KubernetesClient } from '../kubernetes/client';
import { ChatOpenAI } from "@langchain/openai"; // 2. 引入 OpenAI 适配器
import { z } from 'zod';

// 导入工具定义和函数
import {
  LIST_PODS_BY_NS_TOOL,
  LIST_DEVBOX_BY_NS_TOOL,
  LIST_CLUSTER_BY_NS_TOOL,
  LIST_QUOTA_BY_NS_TOOL,
  LIST_INGRESS_BY_NS_TOOL,
  LIST_CRONJOBS_BY_NS_TOOL,
  LIST_EVENTS_BY_NS_TOOL,
  LIST_DEBT_BY_NS_TOOL,
  LIST_OBJECTSTORAGEBUCKET_BY_NS_TOOL,
  LIST_CERTIFICATE_BY_NS_TOOL,
  LIST_DEPLOYMENTS_BY_NS_TOOL,
  LIST_STATEFULSETS_BY_NS_TOOL,
  LIST_APPS_BY_NS_TOOL,
  LIST_PVCS_BY_NS_TOOL,
  GET_LOGS_BY_NS_TOOL,
  NONE_TOOL,
} from '../tools/types';

import { listPodsByNamespace } from '../tools/list-pods-by-ns';
import { listDevboxByNamespace } from '../tools/list-devbox-by-ns';
import { listClusterByNamespace } from '../tools/list-cluster-by-ns';
import { listQuotaByNamespace } from '../tools/list-quota-by-ns';
import { listIngressByNamespace } from '../tools/list-ingress-by-ns';
import { listCronjobsByNamespace } from '../tools/list-cronjobs-by-ns';
import { listEventsByNamespace } from '../tools/list-events-by-ns';
import { listDebtByNamespace } from '../tools/list-debt-by-ns';
import { listObjectStorageBucketByNamespace } from '../tools/list-objectstoragebucket-by-ns';
import { listCertificateByNamespace } from '../tools/list-certificate-by-ns';
import { listDeploymentsByNamespace } from '../tools/list-deployments-by-ns';
import { listStatefulSetsByNamespace } from '../tools/list-statefulsets-by-ns';
import { listAppsByNamespace } from '../tools/list-apps-by-ns';
import { listPvcsByNamespace } from '../tools/list-pvcs-by-ns';
import { getLogsByNamespace } from '../tools/get-logs-by-ns';
import { returnNoneResult } from '../tools/none-tool';

// --- A. 初始化 AI 模型 (Gemini) ---
const AI_API_KEY = process.env.AI_API_KEY;
const AI_BASE_URL = process.env.AI_BASE_URL;
const AI_MODEL = process.env.AI_MODEL || "gemini-1.5-flash";
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 35_000);
const isDevelopment = process.env.NODE_ENV === 'development';

function logDevelopment(...args: unknown[]): void {
  if (isDevelopment) {
    console.log(...args);
  }
}

function formatLogValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return inspect(value, {
    depth: 8,
    colors: false,
    maxArrayLength: 50,
    breakLength: 120,
  });
}

function buildKubeconfigSummary(kubeconfig: string): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    bytes: Buffer.byteLength(kubeconfig, 'utf8'),
    lineCount: kubeconfig === '' ? 0 : kubeconfig.split(/\r?\n/).length,
    sha256: createHash('sha256').update(kubeconfig).digest('hex').slice(0, 12),
  };

  try {
    const kubeConfig = new k8s.KubeConfig();
    kubeConfig.loadFromString(kubeconfig);
    summary.currentContext = kubeConfig.getCurrentContext();
    summary.clusterCount = kubeConfig.getClusters().length;
    summary.contextCount = kubeConfig.getContexts().length;
    summary.userCount = kubeConfig.getUsers().length;
  } catch (error) {
    summary.parseError = error instanceof Error ? error.message : 'Unknown parse error';
  }

  return summary;
}

function loadToolDescriptionOverrides(
  availableToolNames: string[]
): Record<string, string> {
  const overrideFile = process.env.TOOLS_DESC_OVERRIDE_FILE?.trim();
  if (!overrideFile) {
    return {};
  }

  const resolvedOverrideFile = path.isAbsolute(overrideFile)
    ? overrideFile
    : path.resolve(process.cwd(), overrideFile);

  if (!fs.existsSync(resolvedOverrideFile)) {
    return {};
  }

  const availableToolNameSet = new Set(availableToolNames);

  try {
    const fileContent = fs.readFileSync(resolvedOverrideFile, 'utf8');
    const parsed = JSON.parse(fileContent);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error(
        `[Router] Invalid tool description override file format: ${resolvedOverrideFile}`
      );
      return {};
    }

    const overrides: Record<string, string> = {};
    const overriddenToolNames: string[] = [];

    for (const [toolName, description] of Object.entries(parsed)) {
      if (!availableToolNameSet.has(toolName)) {
        continue;
      }
      if (typeof description !== 'string') {
        continue;
      }

      overrides[toolName] = description;
      overriddenToolNames.push(toolName);
    }

    if (overriddenToolNames.length > 0) {
      console.error(
        `[Router] Tool description overrides applied: ${overriddenToolNames.join(', ')}`
      );
    }

    return overrides;
  } catch (error) {
    console.error('[Router] Failed to load tool description override file:', error);
    return {};
  }
}

logDevelopment('[DEBUG] Current CWD:', process.cwd());
logDevelopment('[DEBUG] AI_MODEL:', AI_MODEL);
logDevelopment('[DEBUG] AI_API_KEY Type:', typeof AI_API_KEY);
logDevelopment('[DEBUG] AI_API_KEY Length:', AI_API_KEY ? AI_API_KEY.length : 'Missing/Undefined');


// 检查配置
if (!AI_API_KEY || !AI_BASE_URL) {
  // 如果没配置，我们在 Router 里会做降级处理，或者在这里抛出错误
  console.warn("[Agent] Warning: AI_API_KEY or AI_BASE_URL not set in .env");
}

const formattedBaseUrl = AI_BASE_URL?.endsWith("/v1") ? AI_BASE_URL : `${AI_BASE_URL}/v1`;

const llm = new ChatOpenAI({
  modelName: AI_MODEL,
  apiKey: AI_API_KEY,
  configuration: { baseURL: formattedBaseUrl },
  timeout: LLM_TIMEOUT_MS,
  temperature: 0,
});

// --- B. 定义 State ---
export interface AgentState {
  zone: string;
  namespace: string;
  ticketTitle: string;
  ticketModule: string;
  ticketCategory: string;
  ticketDescription: string;
  historyMessages: string;
  latestMessage: string;
  latestMessageImages: string[];
  requestKubeconfig?: string;

  k8sClient?: KubernetesClient;
  selectedTool?: ToolName;
  toolInput?: unknown;

  finalResult?: unknown;
}

export type AgentRunnable = {
  invoke: (input: AgentState) => Promise<AgentState>;
};

// Zone 映射
export const ZONE_KUBECONFIG_MAP: Record<string, string> = {
  hzh: path.join(process.cwd(), 'kubeconfig', 'hzh-kubeconfig'),
  bja: path.join(process.cwd(), 'kubeconfig', 'bja-kubeconfig'),
  gzg: path.join(process.cwd(), 'kubeconfig', 'gzg-kubeconfig'),
  io: path.join(process.cwd(), 'kubeconfig', 'io-kubeconfig'),
};

export const SUPPORTED_ZONES = Object.keys(ZONE_KUBECONFIG_MAP);

// 工具注册表
const TOOLS = {
  [LIST_PODS_BY_NS_TOOL.name]: {
    description: LIST_PODS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listPodsByNamespace(client, input as any),
  },
  [LIST_DEVBOX_BY_NS_TOOL.name]: {
    description: LIST_DEVBOX_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listDevboxByNamespace(client, input as any),
  },
  [LIST_CLUSTER_BY_NS_TOOL.name]: {
    description: LIST_CLUSTER_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listClusterByNamespace(client, input as any),
  },
  [LIST_QUOTA_BY_NS_TOOL.name]: {
    description: LIST_QUOTA_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listQuotaByNamespace(client, input as any),
  },
  [LIST_INGRESS_BY_NS_TOOL.name]: {
    description: LIST_INGRESS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listIngressByNamespace(client, input as any),
  },
  [LIST_CRONJOBS_BY_NS_TOOL.name]: {
    description: LIST_CRONJOBS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listCronjobsByNamespace(client, input as any),
  },
  [LIST_EVENTS_BY_NS_TOOL.name]: {
    description: LIST_EVENTS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listEventsByNamespace(client, input as any),
  },
  [LIST_DEBT_BY_NS_TOOL.name]: {
    description: LIST_DEBT_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => listDebtByNamespace(client, input as any),
  },
  [LIST_OBJECTSTORAGEBUCKET_BY_NS_TOOL.name]: {
    description: LIST_OBJECTSTORAGEBUCKET_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      listObjectStorageBucketByNamespace(client, input as any),
  },
  [LIST_CERTIFICATE_BY_NS_TOOL.name]: {
    description: LIST_CERTIFICATE_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      listCertificateByNamespace(client, input as any),
  },
  [LIST_DEPLOYMENTS_BY_NS_TOOL.name]: {
    description: LIST_DEPLOYMENTS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      listDeploymentsByNamespace(client, input as any),
  },
  [LIST_STATEFULSETS_BY_NS_TOOL.name]: {
    description: LIST_STATEFULSETS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      listStatefulSetsByNamespace(client, input as any),
  },
  [LIST_APPS_BY_NS_TOOL.name]: {
    description: LIST_APPS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      listAppsByNamespace(client, input as any),
  },
  [LIST_PVCS_BY_NS_TOOL.name]: {
    description: LIST_PVCS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      listPvcsByNamespace(client, input as any),
  },
  [GET_LOGS_BY_NS_TOOL.name]: {
    description: GET_LOGS_BY_NS_TOOL.description,
    run: (client: KubernetesClient, input: unknown) =>
      getLogsByNamespace(client, input as any),
  },
  [NONE_TOOL.name]: {
    description: NONE_TOOL.description,
    run: (client: KubernetesClient, input: unknown) => {
      void client;
      void input;
      return returnNoneResult();
    },
  },
} as const;

const TOOL_DESCRIPTION_OVERRIDES = loadToolDescriptionOverrides(Object.keys(TOOLS));

type ToolName = Extract<keyof typeof TOOLS, string>;

const TOOL_NAMES = Object.keys(TOOLS) as [ToolName, ...ToolName[]];

const routerDecisionSchema = z.object({
  selectedTool: z.enum(TOOL_NAMES),
  toolInput: z.object({}).default({}),
});
type RouterDecision = z.infer<typeof routerDecisionSchema>;
type RouterStructuredResponse = {
  raw: unknown;
  parsed: RouterDecision | null;
};

type RouterMessageContentItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function buildRouterUserContext(state: AgentState): string {
  return `
    User Context:
    - Default Namespace: ${state.namespace}
    - Ticket Title: ${state.ticketTitle}
    - Ticket Module: ${state.ticketModule}
    - Ticket Category: ${state.ticketCategory}
    - Ticket Description: ${state.ticketDescription}
    - History Messages: ${state.historyMessages}
    - Latest Message: ${state.latestMessage}
  `;
}

function buildRouterUserContent(state: AgentState): string | RouterMessageContentItem[] {
  const userContext = buildRouterUserContext(state);
  const imageUrls = Array.from(new Set(state.latestMessageImages.filter(Boolean))).slice(-6);

  if (imageUrls.length === 0) {
    return userContext;
  }

  return [
    { type: 'text', text: userContext },
    ...imageUrls.map((url) => ({
      type: 'image_url' as const,
      image_url: { url },
    })),
  ];
}

// 自动生成 AI Prompt (无需手动维护两份列表)
const GENERATED_TOOLS_DESC = Object.entries(TOOLS)
  .map(([name, tool], index) => {
    const description = TOOL_DESCRIPTION_OVERRIDES[name] ?? tool.description;
    return `${index + 1}. ${name}: ${description}`;
  })
  .join('\n');

const SYSTEM_PROMPT = `
You are a Kubernetes Expert Agent.
Your job is to select the BEST tool based on the user's ticket description.

Available Tools:
${GENERATED_TOOLS_DESC}

Tool Selection Rules:
- Use Ticket Title, Ticket Description, Ticket Module, Ticket Category, History Messages, and Latest Message together as one routing context. Do not rely on Latest Message alone.
- Select "none" only when the current turn is clearly just a greeting, thanks, acknowledgement, filler, or a pure conversational reply that does not require checking live cluster or namespace state.
- If the user is still troubleshooting, is asking about current status, is correcting the previous target, or is asking about any live issue related to namespace resources, do not select "none".
- If the request may depend on current cluster or namespace state, do not select "none" just because the latest message is short or ambiguous.
- If the user mentions public access, external access, 公网, 外网, domain, 域名, CNAME, host, route, ingress, external IP, HTTPS, SSL, certificate, 证书, port exposure, or "访问不到", prefer "list_ingress_by_ns" as the first live-state check unless the request is specifically about certificate issuance or renewal status.
- If the user specifically asks about certificate issuance, renewal, or secure certificate status after domain configuration, prefer "list_certificate_by_ns".
- If the user mentions 欠费, 余额不足, 扣费, 充值后, 费用异常, suspend, release, 被释放, 停服, or post-recharge abnormality, prefer "list_debt_by_ns".
- If the user mentions DevBox, devbox, VS Code, Cursor, Trae, SSH, remote connection, IDE connection, DevBox startup, restart, release, sharing, or DevBox availability, prefer "list_devbox_by_ns".
- If the user explicitly asks for logs, stdout, stderr, stack trace, or runtime output, prefer "get_logs_by_ns".
- When several tools look possible, choose the tool that is the best first live-state inspection for the user's current complaint. Do not choose "none" merely because the message is brief.

Examples:
User: 远程连接不上
Return: {"selectedTool":"list_devbox_by_ns","toolInput":{}}

User: Trae无法连接
Return: {"selectedTool":"list_devbox_by_ns","toolInput":{}}

User: 余额不足被释放了
Return: {"selectedTool":"list_debt_by_ns","toolInput":{}}

User: 充钱后中的项目还是找不到
Return: {"selectedTool":"list_debt_by_ns","toolInput":{}}

User: 公网域名无法访问
Return: {"selectedTool":"list_ingress_by_ns","toolInput":{}}

User: 如何查看应用的对外ip？
Return: {"selectedTool":"list_ingress_by_ns","toolInput":{}}

User: ingress
Return: {"selectedTool":"list_ingress_by_ns","toolInput":{}}

User: 谢谢，知道了
Return: {"selectedTool":"none","toolInput":{}}

Output Format:
You MUST return a strictly valid JSON object. No markdown.
Structure:
{
  "selectedTool": "tool_name_from_above",
  "toolInput": {}
}
Note:
- 'toolInput' must always be an empty object {}.
- Do not add namespace or any extra fields into 'toolInput'.
- The server will inject the trusted namespace during execution.
`;

const structuredRouter = llm.withStructuredOutput(routerDecisionSchema);
const structuredRouterWithRaw = llm.withStructuredOutput(routerDecisionSchema, { includeRaw: true });

// --- Node 1: Init ---
async function initContextNode(state: AgentState): Promise<Partial<AgentState>> {
  const requestKubeconfig = (state.requestKubeconfig ?? '').trim();
  const namespace = (state.namespace || '').trim();

  if (!namespace.startsWith('ns-') || namespace.length <= 3) {
    throw new Error('[Agent] Invalid namespace format, expected ns-xxx');
  }

  if (requestKubeconfig) {
    console.log('[Agent] Init request-scoped KubernetesClient from Authorization header');
    logDevelopment(
      '[Agent] Request kubeconfig summary:',
      JSON.stringify(buildKubeconfigSummary(requestKubeconfig))
    );

    const requestClient = new KubernetesClient(undefined, requestKubeconfig);
    return { k8sClient: requestClient };
  }

  const selectedZone = (state.zone || '').trim();
  const kubeconfigPath = ZONE_KUBECONFIG_MAP[selectedZone];

  if (!kubeconfigPath) {
    throw new Error(`[Agent] Unsupported zone: ${selectedZone}`);
  }
  if (!fs.existsSync(kubeconfigPath)) {
    throw new Error(`[Agent] Local kubeconfig file not found for zone: ${selectedZone}`);
  }

  const userName = namespace.slice(3); // ns-xxx -> xxx

  // 1) master client: use zone kubeconfig to query User CRD
  console.log(`[Agent] Init master KubernetesClient for zone=${selectedZone}`);
  const masterClient = new KubernetesClient(kubeconfigPath);

  // 2) fetch user kubeconfig from cluster-scoped CRD: users.user.sealos.io (user.sealos.io/v1)
  const customObjectsApi = masterClient.getCustomObjectsApi();
  const userObjResp = await customObjectsApi.getClusterCustomObject(
    'user.sealos.io',
    'v1',
    'users',
    userName
  );
  const userObj = userObjResp.body as any;
  const userKubeconfig: string | undefined = userObj?.status?.kubeConfig;

  if (!userKubeconfig || typeof userKubeconfig !== 'string' || userKubeconfig.trim() === '') {
    throw new Error('[Agent] Failed to get user kubeconfig from User.status.kubeConfig');
  }

  console.error(`[Agent] User kubeconfig fetched for user=${userName} zone=${selectedZone}`);
  logDevelopment(
    '[Agent] User kubeconfig summary:',
    JSON.stringify(buildKubeconfigSummary(userKubeconfig))
  );

  // 3) user client: all subsequent tools will use this client (user cluster only)
  const userClient = new KubernetesClient(undefined, userKubeconfig);
  return { k8sClient: userClient };
}

// --- Node 2: Router (AI 智能版) ---
async function routerNode(state: AgentState): Promise<Partial<AgentState>> {
  console.log(`[Router] Asking AI (${AI_MODEL}) to select tool...`);

  const userContext = buildRouterUserContext(state);
  const routerUserContent = buildRouterUserContent(state);

  async function invokeRouter(content: string | RouterMessageContentItem[]) {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: content as any }
    ];
    let decision: RouterDecision;

    if (isDevelopment) {
      const rawResponse = await structuredRouterWithRaw.invoke(messages) as RouterStructuredResponse;
      logDevelopment('[Router] AI raw response:', formatLogValue(rawResponse.raw));

      if (!rawResponse.parsed) {
        throw new Error('[Router] AI raw response could not be parsed');
      }

      decision = rawResponse.parsed;
    } else {
      decision = await structuredRouter.invoke(messages) as RouterDecision;
    }

    console.log('[Router] AI structured decision:', JSON.stringify(decision));

    const selectedTool = decision.selectedTool;

    if (!Object.prototype.hasOwnProperty.call(TOOLS, selectedTool)) {
      throw new Error(`[Router] AI selected unsupported tool: ${selectedTool}`);
    }

    const toolInput =
      decision.toolInput &&
      typeof decision.toolInput === 'object' &&
      !Array.isArray(decision.toolInput)
        ? decision.toolInput
        : {};

    return {
      selectedTool: selectedTool as ToolName,
      toolInput
    };
  }

  try {
    if (Array.isArray(routerUserContent)) {
      try {
        return await invokeRouter(routerUserContent);
      } catch (visionError) {
        console.error('[Router] Vision routing failed, falling back to text routing', visionError);
      }
    }

    return await invokeRouter(userContext);
  } catch (error) {
    console.error("[Router] AI structured routing failed, falling back to list_pods", error);
    // 兜底逻辑
    return { 
      selectedTool: 'list_pods_by_ns', 
      toolInput: { namespace: state.namespace } 
    };
  }
}

// --- Node 3: Executor ---
async function executorNode(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.k8sClient) {
    throw new Error('[Agent] k8sClient not initialized');
  }

  const selectedTool: ToolName = (state.selectedTool ?? 'list_pods_by_ns') as ToolName;
  const tool = TOOLS[selectedTool];

  if (!tool) {
    throw new Error(`[Agent] Unknown tool: ${String(state.selectedTool)}`);
  }

  // 不信任 LLM/toolInput 里的 namespace；最终执行强制使用 state.namespace
  const rawToolInput = state.toolInput;
  const toolInputObject =
    rawToolInput && typeof rawToolInput === 'object' && !Array.isArray(rawToolInput)
      ? (rawToolInput as Record<string, unknown>)
      : {};
  let input: unknown;

  if (selectedTool === NONE_TOOL.name) {
    input = {};
  } else if (selectedTool === GET_LOGS_BY_NS_TOOL.name) {
    input = {
      ...toolInputObject,
      namespace: state.namespace,
      ticketModule: state.ticketModule,
      ticketTitle: state.ticketTitle,
      ticketDescription: state.ticketDescription,
      historyMessages: state.historyMessages,
      latestMessage: state.latestMessage,
    };
  } else {
    input = {
      ...toolInputObject,
      namespace: state.namespace,
    };
  }

  const result = await tool.run(state.k8sClient, input);

  return {
    finalResult: {
      tool: selectedTool,
      description: tool.description,
      result,
    },
  };
}

// --- 构建图 (保留动态导入以防编译错误) ---
let cachedRunnable: AgentRunnable | null = null;

export async function getAgentRunnable(): Promise<AgentRunnable> {
  if (cachedRunnable) return cachedRunnable;

  const langgraph = (await import('@langchain/langgraph')) as any;
  const START = langgraph.START;
  const END = langgraph.END;
  const StateGraph = langgraph.StateGraph;
  const Annotation = langgraph.Annotation;

  const GraphState = Annotation.Root({
    zone: Annotation(),
    namespace: Annotation(),
    ticketTitle: Annotation(),
    ticketModule: Annotation(),
    ticketCategory: Annotation(),
    ticketDescription: Annotation(),
    historyMessages: Annotation(),
    latestMessage: Annotation(),
    latestMessageImages: Annotation(),
    requestKubeconfig: Annotation(),

    k8sClient: Annotation(),
    selectedTool: Annotation(),
    toolInput: Annotation(),
    finalResult: Annotation(),
  });

  const workflow = new StateGraph(GraphState)
    .addNode('init', initContextNode)
    .addNode('router', routerNode)
    .addNode('executor', executorNode)
    .addEdge(START, 'init')
    .addEdge('init', 'router')
    .addEdge('router', 'executor')
    .addEdge('executor', END);

  cachedRunnable = workflow.compile() as AgentRunnable;
  return cachedRunnable;
}
