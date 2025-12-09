import { ListQuotaByNsInput, ListQuotaByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError } from '../kubernetes/types';
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

export async function listQuotaByNamespace(input: ListQuotaByNsInput) {
  // Validate input
  const validatedInput = ListQuotaByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  // Log execution as required
  console.error(`[Server] Executing: kubectl get quota -n ${namespace}`);

  try {
    const k8sApi = kubernetesClient.getApiClient();

    // List resource quotas in the specified namespace
    const quotaList = await k8sApi.listNamespacedResourceQuota(namespace);

    // Transform quota data
    const quotas = quotaList.body.items.map((quota: k8s.V1ResourceQuota) => {
      // Extract hard and used limits
      const hard = quota.status?.hard || {};
      const used = quota.status?.used || {};

      // Build a details string for display
      const details = Object.keys(hard).map(key => {
        const usedValue = used[key] || '0';
        const hardValue = hard[key];
        return `${key}: ${usedValue}/${hardValue}`;
      }).join(', ');

      return {
        name: quota.metadata?.name || 'unknown',
        namespace: quota.metadata?.namespace || namespace,
        details: details || 'No limits defined',
      };
    });

    return {
      namespace,
      quotas,
      total: quotas.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error (not noisy full object)
    console.error(`[Server] Error listing quotas in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response without crashing
    return {
      namespace,
      quotas: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}