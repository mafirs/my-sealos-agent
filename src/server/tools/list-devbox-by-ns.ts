import { ListDevboxByNsInput, ListDevboxByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';

export async function listDevboxByNamespace(input: ListDevboxByNsInput) {
  const validatedInput = ListDevboxByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  console.error(`[Server] Executing: kubectl get devbox -n ${namespace}`);

  try {
    const customObjectsApi = kubernetesClient.getCustomObjectsApi();

    const response = await customObjectsApi.listNamespacedCustomObject(
      'devbox.sealos.io',  // group
      'v1alpha2',          // version
      namespace,           // namespace
      'devboxes'           // plural
    );

    // Extract and transform devbox data
    const devboxes = (response.body as any).items?.map((item: any) => ({
      name: item.metadata?.name || 'unknown',
      status: item.status?.phase || item.status?.state || 'Unknown',
      network: item.status?.network || {},
    })) || [];

    return {
      namespace,
      devboxes,
      total: devboxes.length,
      success: true,
    };
  } catch (error: any) {
    console.error(`[Server] Error listing devboxes in namespace ${namespace}:`, error);

    // Extract meaningful error information
    let errorMessage = 'Unknown error occurred';
    if (error.response && error.response.body && error.response.body.message) {
      errorMessage = error.response.body.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      namespace,
      devboxes: [],
      total: 0,
      error: errorMessage,
      success: false,
    };
  }
}