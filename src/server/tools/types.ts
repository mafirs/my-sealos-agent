import { z } from 'zod';

// Schema for list_pods_by_ns tool
export const ListPodsByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListPodsByNsInput = z.infer<typeof ListPodsByNsInputSchema>;

// Tool definitions for MCP
export const LIST_PODS_BY_NS_TOOL = {
  name: 'list_pods_by_ns',
  description: 'List all pods in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list pods from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_devbox_by_ns tool
export const ListDevboxByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListDevboxByNsInput = z.infer<typeof ListDevboxByNsInputSchema>;

// Devbox tool definitions for MCP
export const LIST_DEVBOX_BY_NS_TOOL = {
  name: 'list_devbox_by_ns',
  description: 'List all devboxes in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list devboxes from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_cluster_by_ns tool
export const ListClusterByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListClusterByNsInput = z.infer<typeof ListClusterByNsInputSchema>;

// Cluster tool definitions for MCP
export const LIST_CLUSTER_BY_NS_TOOL = {
  name: 'list_cluster_by_ns',
  description: 'List KubeBlocks clusters (databases) in a namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list clusters from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_quota_by_ns tool
export const ListQuotaByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListQuotaByNsInput = z.infer<typeof ListQuotaByNsInputSchema>;

// Quota tool definitions for MCP
export const LIST_QUOTA_BY_NS_TOOL = {
  name: 'list_quota_by_ns',
  description: 'List resource quotas in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list quotas from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_ingress_by_ns tool
export const ListIngressByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListIngressByNsInput = z.infer<typeof ListIngressByNsInputSchema>;

// Ingress tool definitions for MCP
export const LIST_INGRESS_BY_NS_TOOL = {
  name: 'list_ingress_by_ns',
  description: 'List Ingress resources in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list Ingress resources from',
      },
    },
    required: ['namespace'],
  },
};