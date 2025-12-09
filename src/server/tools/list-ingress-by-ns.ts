import { ListIngressByNsInput, ListIngressByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListIngressResponse } from '../kubernetes/types';
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

export async function listIngressByNamespace(input: ListIngressByNsInput): Promise<ListIngressResponse> {
  // Validate input
  const validatedInput = ListIngressByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  // Log execution as required
  console.error(`[Server] Executing: kubectl get ingress -n ${namespace}`);

  try {
    const networkingV1Api = kubernetesClient.getNetworkingV1Api();

    // List Ingress resources in the specified namespace
    const ingressList = await networkingV1Api.listNamespacedIngress(namespace);

    // Transform ingress data
    const ingresses = ingressList.body.items.map((ingress: k8s.V1Ingress) => {
      // Extract hosts and paths from rules
      const hosts: string[] = [];
      const paths: string[] = [];
      let backendService = '';
      let backendPort = '';

      if (ingress.spec?.rules) {
        ingress.spec.rules.forEach(rule => {
          if (rule.host) {
            hosts.push(rule.host);
          }
          if (rule.http?.paths) {
            rule.http.paths.forEach(path => {
              paths.push(path.path || '/');
              if (path.backend?.service) {
                backendService = path.backend.service.name || '';
                if (path.backend.service.port) {
                  backendPort = (path.backend.service.port as any).number?.toString()
                    || (path.backend.service.port as any).name
                    || '';
                }
              }
            });
          }
        });
      }

      // Get ingress class
      const ingressClass = ingress.spec?.ingressClassName || undefined;

      // Get address from load balancer
      const address = ingress.status?.loadBalancer?.ingress?.[0]?.ip ||
                     ingress.status?.loadBalancer?.ingress?.[0]?.hostname ||
                     undefined;

      // Calculate age
      const age = ingress.metadata?.creationTimestamp
        ? calculateAge(new Date(ingress.metadata.creationTimestamp))
        : undefined;

      return {
        name: ingress.metadata?.name || 'unknown',
        namespace: ingress.metadata?.namespace || namespace,
        hosts: hosts.join(', ') || 'No host',
        paths: paths.join(', ') || '/',
        backendService: backendService || 'No backend',
        backendPort: backendPort || 'No port',
        ingressClass,
        address,
        age,
      };
    });

    return {
      namespace,
      ingresses,
      total: ingresses.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error (not noisy full object)
    console.error(`[Server] Error listing ingresses in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response without crashing
    return {
      namespace,
      ingresses: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}