import { ListAccountByNsInput, ListAccountByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListAccountResponse, AccountStatus } from '../kubernetes/types';

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

export async function listAccountByNamespace(input: ListAccountByNsInput): Promise<ListAccountResponse> {
  // Validate input
  const validatedInput = ListAccountByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  // Log execution as required
  console.error(`[Server] Executing: kubectl get accounts -n ${namespace}`);

  try {
    const customObjectsApi = kubernetesClient.getCustomObjectsApi();

    // List Account CRD resources in the specified namespace
    const accountList = await customObjectsApi.listNamespacedCustomObject(
      'account.sealos.io',  // group
      'v1',                 // version
      namespace,           // namespace
      'accounts'           // plural
    );

    // Transform Account data
    const accounts = (accountList.body as any).items?.map((account: any) => {
      // Extract basic info
      const name = account.metadata?.name || 'unknown';
      const accountNamespace = account.metadata?.namespace || namespace;

      // Extract status with complete information
      const status: AccountStatus = account.status || {};

      // Calculate age
      const age = account.metadata?.creationTimestamp
        ? calculateAge(new Date(account.metadata.creationTimestamp))
        : undefined;

      return {
        name: name,
        namespace: accountNamespace,
        status: status,
        age: age
      };
    }) || [];

    return {
      namespace,
      accounts,
      total: accounts.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error
    console.error(`[Server] Error listing accounts in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response
    return {
      namespace,
      accounts: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}