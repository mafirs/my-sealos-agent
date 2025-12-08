import { ListPodsByNsInput, ListPodsByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { PodInfo, ListPodsResponse, KubernetesError } from '../kubernetes/types';
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

export async function listPodsByNamespace(input: ListPodsByNsInput): Promise<ListPodsResponse> {
  // Validate input
  const validatedInput = ListPodsByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  // Log execution as required
  console.error(`[Server] Executing: kubectl get pods -n ${namespace}`);

  try {
    const k8sApi = kubernetesClient.getApiClient();

    // List pods in the specified namespace
    const podList = await k8sApi.listNamespacedPod(namespace);

    // Transform pod data
    const pods: PodInfo[] = podList.body.items.map((pod: k8s.V1Pod) => ({
      name: pod.metadata?.name || 'unknown',
      namespace: pod.metadata?.namespace || namespace,
      status: pod.status?.phase || 'Unknown',
      ip: pod.status?.podIP,
      node: pod.spec?.nodeName,
    }));

    return {
      namespace,
      pods,
      total: pods.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error (not noisy full object)
    console.error(`[Server] Error listing pods in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response without crashing
    return {
      namespace,
      pods: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}