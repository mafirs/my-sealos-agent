import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  LIST_PODS_BY_NS_TOOL,
  LIST_DEVBOX_BY_NS_TOOL,
  LIST_CLUSTER_BY_NS_TOOL,
  LIST_QUOTA_BY_NS_TOOL,
  LIST_INGRESS_BY_NS_TOOL,
  LIST_NODES_TOOL,
  LIST_CRONJOBS_BY_NS_TOOL,
  LIST_EVENTS_BY_NS_TOOL,
  LIST_ACCOUNT_BY_NS_TOOL,
  LIST_DEBT_BY_NS_TOOL
} from './tools/types';
import { listPodsByNamespace } from './tools/list-pods-by-ns';
import { listDevboxByNamespace } from './tools/list-devbox-by-ns';
import { listClusterByNamespace } from './tools/list-cluster-by-ns';
import { listQuotaByNamespace } from './tools/list-quota-by-ns';
import { listIngressByNamespace } from './tools/list-ingress-by-ns';
import { listNodes } from './tools/list-nodes';
import { listCronjobsByNamespace } from './tools/list-cronjobs-by-ns';
import { listEventsByNamespace } from './tools/list-events-by-ns';
import { listAccountByNamespace } from './tools/list-account-by-ns';
import { listDebtByNamespace } from './tools/list-debt-by-ns';
import { kubernetesClient } from './kubernetes/client';

async function main() {
  // Initialize Kubernetes client
  console.error('[Server] Initializing Kubernetes client...');
  const isConnected = await kubernetesClient.testConnection();

  if (!isConnected) {
    console.error('[Server] Warning: Failed to connect to Kubernetes cluster');
  } else {
    const context = kubernetesClient.getCurrentContext();
    console.error(`[Server] Connected to cluster: ${context.cluster}`);
  }

  // Create MCP server
  const server = new Server(
    {
      name: 'sealos-sre-agent-server',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        LIST_PODS_BY_NS_TOOL,
        LIST_DEVBOX_BY_NS_TOOL,
        LIST_CLUSTER_BY_NS_TOOL,
        LIST_QUOTA_BY_NS_TOOL,
        LIST_INGRESS_BY_NS_TOOL,
        LIST_NODES_TOOL,
        LIST_CRONJOBS_BY_NS_TOOL,
        LIST_EVENTS_BY_NS_TOOL,
        LIST_ACCOUNT_BY_NS_TOOL,
        LIST_DEBT_BY_NS_TOOL,
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'list_pods_by_ns':
          const result = await listPodsByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };

        case 'list_devbox_by_ns':
          const devboxResult = await listDevboxByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(devboxResult, null, 2),
              },
            ],
          };

        case 'list_cluster_by_ns':
          const clusterResult = await listClusterByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(clusterResult, null, 2),
              },
            ],
          };

        case 'list_quota_by_ns':
          const quotaResult = await listQuotaByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(quotaResult, null, 2),
              },
            ],
          };

        case 'list_ingress_by_ns':
          const ingressResult = await listIngressByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(ingressResult, null, 2),
              },
            ],
          };

        case 'list_nodes':
          const nodesResult = await listNodes(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(nodesResult, null, 2),
              },
            ],
          };

        case 'list_cronjobs_by_ns':
          const cronjobsResult = await listCronjobsByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(cronjobsResult, null, 2),
              },
            ],
          };

        case 'list_events_by_ns':
          const eventsResult = await listEventsByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(eventsResult, null, 2),
              },
            ],
          };

        case 'list_account_by_ns':
          const accountResult = await listAccountByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(accountResult, null, 2),
              },
            ],
          };

        case 'list_debt_by_ns':
          const debtResult = await listDebtByNamespace(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(debtResult, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      console.error(`[Server] Error executing tool ${name}:`, error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Start the server
  const transport = new StdioServerTransport();
  console.error('[Server] Starting MCP server...');
  await server.connect(transport);
  console.error('[Server] MCP server started and listening');
}

main().catch((error) => {
  console.error('[Server] Fatal error:', error);
  process.exit(1);
});