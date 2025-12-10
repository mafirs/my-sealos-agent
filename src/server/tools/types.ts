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

// Schema for list_nodes tool
export const ListNodesInputSchema = z.object({
  namespace: z.string().optional(),
});

export type ListNodesInput = z.infer<typeof ListNodesInputSchema>;

// Node tool definitions for MCP
export const LIST_NODES_TOOL = {
  name: 'list_nodes',
  description: 'List all cluster nodes',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'Ignored for cluster-level resources',
      },
    },
    required: [],
  },
};

// Schema for list_cronjobs_by_ns tool
export const ListCronjobsByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListCronjobsByNsInput = z.infer<typeof ListCronjobsByNsInputSchema>;

// CronJob tool definitions for MCP
export const LIST_CRONJOBS_BY_NS_TOOL = {
  name: 'list_cronjobs_by_ns',
  description: 'List CronJob resources in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list CronJob resources from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_events_by_ns tool
export const ListEventsByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListEventsByNsInput = z.infer<typeof ListEventsByNsInputSchema>;

// Event tool definitions for MCP
export const LIST_EVENTS_BY_NS_TOOL = {
  name: 'list_events_by_ns',
  description: 'List Event resources in a specific namespace (last 100, sorted by timestamp)',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list Event resources from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_account_by_ns tool
export const ListAccountByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListAccountByNsInput = z.infer<typeof ListAccountByNsInputSchema>;

// Account tool definitions for MCP
export const LIST_ACCOUNT_BY_NS_TOOL = {
  name: 'list_account_by_ns',
  description: 'List Account CRD resources in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list Account CRD resources from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_debt_by_ns tool
export const ListDebtByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListDebtByNsInput = z.infer<typeof ListDebtByNsInputSchema>;

// Debt tool definitions for MCP
export const LIST_DEBT_BY_NS_TOOL = {
  name: 'list_debt_by_ns',
  description: 'List Debt CRD resources in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list Debt CRD resources from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_objectstoragebucket_by_ns tool
export const ListObjectStorageBucketByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListObjectStorageBucketByNsInput = z.infer<typeof ListObjectStorageBucketByNsInputSchema>;

// ObjectStorageBucket tool definitions for MCP
export const LIST_OBJECTSTORAGEBUCKET_BY_NS_TOOL = {
  name: 'list_objectstoragebucket_by_ns',
  description: 'List ObjectStorageBucket CRD resources in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list ObjectStorageBucket CRD resources from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for list_certificate_by_ns tool
export const ListCertificateByNsInputSchema = z.object({
  namespace: z.string().min(1, 'Namespace is required'),
});

export type ListCertificateByNsInput = z.infer<typeof ListCertificateByNsInputSchema>;

// Certificate tool definitions for MCP
export const LIST_CERTIFICATE_BY_NS_TOOL = {
  name: 'list_certificate_by_ns',
  description: 'List Certificate CRD resources in a specific namespace',
  inputSchema: {
    type: 'object',
    properties: {
      namespace: {
        type: 'string',
        description: 'The namespace to list Certificate CRD resources from',
      },
    },
    required: ['namespace'],
  },
};

// Schema for inspect_resource tool
export const InspectResourceInputSchema = z.object({
  resource: z.string().min(1, 'Resource type is required'),
  name: z.string().min(1, 'Resource name is required'),
  namespace: z.string().min(1, 'Namespace is required'),
});

export type InspectResourceInput = z.infer<typeof InspectResourceInputSchema>;

// Inspect resource tool definitions for MCP
export const INSPECT_RESOURCE_TOOL = {
  name: 'inspect_resource',
  description: 'Inspect a Kubernetes resource by fetching its manifest, events, and logs (for pods)',
  inputSchema: {
    type: 'object',
    properties: {
      resource: {
        type: 'string',
        description: 'The type of resource to inspect (e.g., pod, deployment, service, devbox, cluster). Both singular and plural forms are accepted.',
      },
      name: {
        type: 'string',
        description: 'The name of the resource to inspect',
      },
      namespace: {
        type: 'string',
        description: 'The namespace where the resource is located',
      },
    },
    required: ['resource', 'name', 'namespace'],
  },
};