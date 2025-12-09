import { ListNodesInput, ListNodesInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListNodesResponse } from '../kubernetes/types';
import * as k8s from '@kubernetes/client-node';

/**
 * Extract meaningful error information from Kubernetes HttpError
 */
function extractKubernetesError(error: any): KubernetesError {
  // Check if it's a Kubernetes HttpError
  if (error && error.response && error.body) {
    const statusCode = error.statusCode || (error.response && error.response.statusCode);

    // Try to parse Kubernetes API error response
    let k8sError: KubernetesError = {
      code: statusCode,
      message: 'Unknown Kubernetes error',
    };

    try {
      if (typeof error.body === 'string') {
        // Parse JSON string response
        const errorBody = JSON.parse(error.body);
        k8sError = {
          code: errorBody.code || statusCode,
          reason: errorBody.reason,
          message: errorBody.message || error.body,
          details: errorBody.details,
        };
      } else if (typeof error.body === 'object') {
        // Handle object response directly
        k8sError = {
          code: error.body.code || statusCode,
          reason: error.body.reason,
          message: error.body.message || JSON.stringify(error.body),
          details: error.body.details,
        };
      }
    } catch (parseError) {
      // Fallback if parsing fails
      k8sError.message = error.message || 'Failed to parse Kubernetes error';
    }

    return k8sError;
  }

  // Handle non-Kubernetes errors
  return {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
  };
}

/**
 * Calculate age from creation timestamp
 */
function calculateAge(creationTimestamp: Date): string {
  const now = new Date();
  const diff = now.getTime() - creationTimestamp.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days > 0) {
    return `${days}d`;
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours > 0) {
    return `${hours}h`;
  }

  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes}m`;
}

export async function listNodes(input: ListNodesInput): Promise<ListNodesResponse> {
  // Validate input (namespace is ignored for nodes)
  ListNodesInputSchema.parse(input);

  // Log execution as required
  console.error(`[Server] Executing: kubectl get nodes`);

  try {
    const k8sApi = kubernetesClient.getApiClient();

    // List all nodes in the cluster (cluster-level resource)
    const nodeList = await k8sApi.listNode();

    // Transform node data
    const nodes = nodeList.body.items.map((node: k8s.V1Node) => {
      // Extract node status
      const conditions = node.status?.conditions || [];
      const readyCondition = conditions.find((c: any) => c.type === 'Ready');
      const status = readyCondition?.status === 'True' ? 'Ready' : 'NotReady';

      // Extract node roles from labels
      const labels = node.metadata?.labels || {};
      const roles = Object.keys(labels)
        .filter(key => key.startsWith('node-role.kubernetes.io/'))
        .map(key => labels[key] || key.replace('node-role.kubernetes.io/', ''))
        .join(', ') || 'worker';

      // Get node IP
      const addresses = node.status?.addresses || [];
      const ip = addresses.find((a: any) => a.type === 'InternalIP')?.address ||
           addresses.find((a: any) => a.type === 'ExternalIP')?.address || '-';

      // Get OS image
      const osImage = node.status?.nodeInfo?.osImage || '-';

      // Calculate age
      const age = node.metadata?.creationTimestamp
        ? calculateAge(new Date(node.metadata.creationTimestamp))
        : undefined;

      return {
        name: node.metadata?.name || 'unknown',
        status: status,
        roles: roles,
        age: age,
        ip: ip,
        osImage: osImage
      };
    });

    return {
      nodes,
      total: nodes.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error
    console.error(`[Server] Error listing nodes:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response
    return {
      nodes: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}