import { ListClusterByNsInput, ListClusterByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';

export async function listClusterByNamespace(input: ListClusterByNsInput) {
  const validatedInput = ListClusterByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  console.error(`[Server] Executing: kubectl get cluster -n ${namespace}`);

  try {
    const customObjectsApi = kubernetesClient.getCustomObjectsApi();

    const response = await customObjectsApi.listNamespacedCustomObject(
      'apps.kubeblocks.io',  // group
      'v1alpha1',           // version
      namespace,            // namespace
      'clusters'            // plural (required by K8s API)
    );

    // Extract and transform cluster data
    const clusters = (response.body as any).items?.map((item: any) => ({
      name: item.metadata?.name || 'unknown',
      status: item.status?.phase || 'Unknown',
      type: item.spec?.clusterDefinitionRef || 'Unknown',
      version: item.spec?.clusterVersionRef || 'Unknown',
    })) || [];

    return {
      namespace,
      clusters,
      total: clusters.length,
      success: true,
    };
  } catch (error: any) {
    console.error(`[Server] Error listing clusters in namespace ${namespace}:`, error);

    let errorMessage = 'Unknown error occurred';
    if (error.response && error.response.body && error.response.body.message) {
      errorMessage = error.response.body.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      namespace,
      clusters: [],
      total: 0,
      error: errorMessage,
      success: false,
    };
  }
}