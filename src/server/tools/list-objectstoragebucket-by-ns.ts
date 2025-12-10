import { ListObjectStorageBucketByNsInput, ListObjectStorageBucketByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListObjectStorageBucketResponse } from '../kubernetes/types';

/**
 * Format bytes to human-readable format
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Calculate age from creation timestamp
 */
function calculateAge(creationTimestamp: string): string {
  const now = new Date();
  const created = new Date(creationTimestamp);
  const diff = now.getTime() - created.getTime();
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

/**
 * Extract meaningful error information from Kubernetes HttpError
 */
function extractKubernetesError(error: any): KubernetesError {
  if (error?.response?.body) {
    const responseBody = error.response.body;
    return {
      code: error.response.statusCode || 500,
      reason: responseBody.reason || 'Unknown',
      message: responseBody.message || error.message,
      details: responseBody.details,
    };
  }

  if (error?.statusCode) {
    return {
      code: error.statusCode,
      reason: error.code || 'Unknown',
      message: error.message || 'Unknown error occurred',
    };
  }

  return {
    code: 500,
    reason: 'Unknown',
    message: error?.message || 'Unknown error occurred',
  };
}

export async function listObjectStorageBucketByNamespace(input: ListObjectStorageBucketByNsInput): Promise<ListObjectStorageBucketResponse> {
  const validatedInput = ListObjectStorageBucketByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  console.error(`[Server] Executing: kubectl get objectstoragebuckets -n ${namespace}`);

  try {
    const customObjectsApi = kubernetesClient.getCustomObjectsApi();

    const objectstoragebucketList = await customObjectsApi.listNamespacedCustomObject(
      'objectstorage.sealos.io',  // group
      'v1',                       // version
      namespace,                  // namespace
      'objectstoragebuckets'      // plural
    );

    const objectstoragebuckets = (objectstoragebucketList.body as any).items?.map((bucket: any) => {
      const name = bucket.metadata?.name || 'unknown';
      const bucketNamespace = bucket.metadata?.namespace || namespace;
      const policy = bucket.spec?.policy || 'private';
      const size = bucket.status?.size ? formatBytes(bucket.status.size) : 'unknown';
      const bucketName = bucket.status?.name || 'unknown';

      const age = bucket.metadata?.creationTimestamp
        ? calculateAge(bucket.metadata.creationTimestamp)
        : undefined;

      return {
        name: name,
        namespace: bucketNamespace,
        policy: policy,
        size: size,
        bucketName: bucketName,
        age: age
      };
    }) || [];

    return {
      namespace,
      objectstoragebuckets,
      total: objectstoragebuckets.length,
      success: true,
    };
  } catch (error) {
    const k8sError = extractKubernetesError(error);

    console.error(`[Server] Error listing objectstoragebuckets in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    return {
      namespace,
      objectstoragebuckets: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}