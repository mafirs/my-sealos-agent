import { InspectResourceInput, InspectResourceInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError } from '../kubernetes/types';

// Resource type mapping with both singular and plural forms
const RESOURCE_MAPPING: Record<string, { group: string; version: string; plural: string }> = {
  // Standard Kubernetes resources
  'pod': { group: '', version: 'v1', plural: 'pods' },
  'pods': { group: '', version: 'v1', plural: 'pods' },
  'deployment': { group: 'apps', version: 'v1', plural: 'deployments' },
  'deployments': { group: 'apps', version: 'v1', plural: 'deployments' },
  'service': { group: '', version: 'v1', plural: 'services' },
  'services': { group: '', version: 'v1', plural: 'services' },
  'configmap': { group: '', version: 'v1', plural: 'configmaps' },
  'configmaps': { group: '', version: 'v1', plural: 'configmaps' },
  'secret': { group: '', version: 'v1', plural: 'secrets' },
  'secrets': { group: '', version: 'v1', plural: 'secrets' },
  'ingress': { group: 'networking.k8s.io', version: 'v1', plural: 'ingresses' },
  'ingresses': { group: 'networking.k8s.io', version: 'v1', plural: 'ingresses' },
  'persistentvolume': { group: '', version: 'v1', plural: 'persistentvolumes' },
  'persistentvolumes': { group: '', version: 'v1', plural: 'persistentvolumes' },
  'persistentvolumeclaim': { group: '', version: 'v1', plural: 'persistentvolumeclaims' },
  'persistentvolumeclaims': { group: '', version: 'v1', plural: 'persistentvolumeclaims' },
  'statefulset': { group: 'apps', version: 'v1', plural: 'statefulsets' },
  'statefulsets': { group: 'apps', version: 'v1', plural: 'statefulsets' },
  'daemonset': { group: 'apps', version: 'v1', plural: 'daemonsets' },
  'daemonsets': { group: 'apps', version: 'v1', plural: 'daemonsets' },
  'job': { group: 'batch', version: 'v1', plural: 'jobs' },
  'jobs': { group: 'batch', version: 'v1', plural: 'jobs' },
  'cronjob': { group: 'batch', version: 'v1', plural: 'cronjobs' },
  'cronjobs': { group: 'batch', version: 'v1', plural: 'cronjobs' },
  'namespace': { group: '', version: 'v1', plural: 'namespaces' },
  'namespaces': { group: '', version: 'v1', plural: 'namespaces' },
  'node': { group: '', version: 'v1', plural: 'nodes' },
  'nodes': { group: '', version: 'v1', plural: 'nodes' },
  'event': { group: '', version: 'v1', plural: 'events' },
  'events': { group: '', version: 'v1', plural: 'events' },
  'serviceaccount': { group: '', version: 'v1', plural: 'serviceaccounts' },
  'serviceaccounts': { group: '', version: 'v1', plural: 'serviceaccounts' },
  'role': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'roles' },
  'roles': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'roles' },
  'rolebinding': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'rolebindings' },
  'rolebindings': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'rolebindings' },
  'clusterrole': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'clusterroles' },
  'clusterroles': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'clusterroles' },
  'clusterrolebinding': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'clusterrolebindings' },
  'clusterrolebindings': { group: 'rbac.authorization.k8s.io', version: 'v1', plural: 'clusterrolebindings' },
  'resourcequota': { group: '', version: 'v1', plural: 'resourcequotas' },
  'resourcequotas': { group: '', version: 'v1', plural: 'resourcequotas' },
  'horizontalpodautoscaler': { group: 'autoscaling', version: 'v2', plural: 'horizontalpodautoscalers' },
  'horizontalpodautoscalers': { group: 'autoscaling', version: 'v2', plural: 'horizontalpodautoscalers' },

  // Sealos CRDs (CORRECTED based on working list-* implementations)
  'devbox': { group: 'devbox.sealos.io', version: 'v1alpha1', plural: 'devboxes' },
  'devboxes': { group: 'devbox.sealos.io', version: 'v1alpha1', plural: 'devboxes' },
  'cluster': { group: 'apps.kubeblocks.io', version: 'v1alpha1', plural: 'clusters' },        // FIXED: v1 → v1alpha1
  'clusters': { group: 'apps.kubeblocks.io', version: 'v1alpha1', plural: 'clusters' },       // FIXED: v1 → v1alpha1
  'account': { group: 'account.sealos.io', version: 'v1', plural: 'accounts' },             // FIXED: user.sealos.io → account.sealos.io
  'accounts': { group: 'account.sealos.io', version: 'v1', plural: 'accounts' },            // FIXED: user.sealos.io → account.sealos.io
  'debt': { group: 'account.sealos.io', version: 'v1', plural: 'debts' },                   // FIXED: user.sealos.io → account.sealos.io
  'debts': { group: 'account.sealos.io', version: 'v1', plural: 'debts' },                  // FIXED: user.sealos.io → account.sealos.io
  'objectstoragebucket': { group: 'objectstorage.sealos.io', version: 'v1', plural: 'objectstoragebuckets' },
  'objectstoragebuckets': { group: 'objectstorage.sealos.io', version: 'v1', plural: 'objectstoragebuckets' },
  'certificate': { group: 'cert-manager.io', version: 'v1', plural: 'certificates' },
  'certificates': { group: 'cert-manager.io', version: 'v1', plural: 'certificates' },
  'issuer': { group: 'cert-manager.io', version: 'v1', plural: 'issuers' },
  'issuers': { group: 'cert-manager.io', version: 'v1', plural: 'issuers' },
  'clusterissuer': { group: 'cert-manager.io', version: 'v1', plural: 'clusterissuers' },
  'clusterissuers': { group: 'cert-manager.io', version: 'v1', plural: 'clusterissuers' },
};

// Response type for MCP tool
export interface InspectResourceResponse {
  manifest?: any;
  events?: any[];
  logs?: string;
  warnings?: string[];
  error?: KubernetesError;
  success: boolean;
}

/**
 * Extract meaningful error information from Kubernetes HttpError
 */
function extractKubernetesError(error: any): KubernetesError {
  if (error && error.response && error.body) {
    const statusCode = error.statusCode || (error.response && error.response.statusCode);

    let k8sError: KubernetesError = {
      code: statusCode,
      message: 'Unknown Kubernetes error',
    };

    try {
      if (typeof error.body === 'string') {
        const errorBody = JSON.parse(error.body);
        k8sError = {
          code: errorBody.code || statusCode,
          reason: errorBody.reason,
          message: errorBody.message || error.body,
          details: errorBody.details,
        };
      } else if (typeof error.body === 'object') {
        k8sError = {
          code: error.body.code || statusCode,
          reason: error.body.reason,
          message: error.body.message || JSON.stringify(error.body),
          details: error.body.details,
        };
      }
    } catch (parseError) {
      k8sError.message = error.message || 'Failed to parse Kubernetes error';
    }

    return k8sError;
  }

  return {
    message: error instanceof Error ? error.message : 'Unknown error occurred',
  };
}

/**
 * Clean Kubernetes resource manifest by removing sensitive and noisy fields
 */
function cleanManifest(manifest: any): any {
  if (!manifest || typeof manifest !== 'object') {
    return manifest;
  }

  // Create a deep copy to avoid modifying the original
  const cleaned = JSON.parse(JSON.stringify(manifest));

  // Remove managedFields
  if (cleaned.metadata && cleaned.metadata.managedFields) {
    delete cleaned.metadata.managedFields;
  }

  // Remove last-applied-configuration annotation
  if (cleaned.metadata && cleaned.metadata.annotations) {
    if (cleaned.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration']) {
      delete cleaned.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'];
    }

    // Remove empty annotations object
    if (Object.keys(cleaned.metadata.annotations).length === 0) {
      delete cleaned.metadata.annotations;
    }
  }

  // For Secrets, never return the data field
  if (cleaned.kind === 'Secret') {
    delete cleaned.data;
  }

  return cleaned;
}

/**
 * Fetch resource manifest
 */
async function fetchResourceManifest(
  resourceType: string,
  resourceName: string,
  namespace: string
): Promise<{ manifest?: any; error?: string }> {
  try {
    const mapping = RESOURCE_MAPPING[resourceType.toLowerCase()];
    if (!mapping) {
      return { error: `Unsupported resource type: ${resourceType}` };
    }

    const { group, version, plural } = mapping;

    if (group === '') {
      // Core API resources
      const k8sApi = kubernetesClient.getApiClient();
      let response;

      switch (plural) {
        case 'pods':
          response = await k8sApi.readNamespacedPod(resourceName, namespace);
          break;
        case 'services':
          response = await k8sApi.readNamespacedService(resourceName, namespace);
          break;
        case 'configmaps':
          response = await k8sApi.readNamespacedConfigMap(resourceName, namespace);
          break;
        case 'secrets':
          response = await k8sApi.readNamespacedSecret(resourceName, namespace);
          break;
        case 'events':
          response = await k8sApi.readNamespacedEvent(resourceName, namespace);
          break;
        case 'namespaces':
          response = await k8sApi.readNamespace(resourceName);
          break;
        case 'nodes':
          response = await k8sApi.readNode(resourceName);
          break;
        case 'persistentvolumes':
          response = await k8sApi.readPersistentVolume(resourceName);
          break;
        case 'persistentvolumeclaims':
          response = await k8sApi.readNamespacedPersistentVolumeClaim(resourceName, namespace);
          break;
        case 'resourcequotas':
          response = await k8sApi.readNamespacedResourceQuota(resourceName, namespace);
          break;
        case 'serviceaccounts':
          response = await k8sApi.readNamespacedServiceAccount(resourceName, namespace);
          break;
        default:
          return { error: `Unsupported core resource: ${plural}` };
      }

      return { manifest: cleanManifest(response.body) };
    }

    // Custom Objects API for CRDs
    const customObjectsApi = kubernetesClient.getCustomObjectsApi();
    const response = await customObjectsApi.getNamespacedCustomObject(
      group,
      version,
      namespace,
      plural,
      resourceName
    );

    return { manifest: cleanManifest(response.body) };
  } catch (error) {
    const k8sError = extractKubernetesError(error);
    return { error: `Failed to fetch manifest: ${k8sError.message}` };
  }
}

/**
 * Fetch events for a specific resource
 */
async function fetchResourceEvents(
  _resourceType: string, // Unused parameter - prefix with underscore to avoid TypeScript warning
  resourceName: string,
  namespace: string
): Promise<{ events?: any[]; error?: string }> {
  try {
    const k8sApi = kubernetesClient.getApiClient();
    const eventList = await k8sApi.listNamespacedEvent(
      namespace,
      undefined,
      undefined,
      undefined,
      `involvedObject.name=${resourceName}` // FIXED: Removed prefix and fragile Kind check
    );

    const events = eventList.body.items
      .map((event: any) => ({
        type: event.type || 'Unknown',
        reason: event.reason || 'Unknown',
        message: event.message || 'No message',
        firstTimestamp: event.firstTimestamp,
        lastTimestamp: event.lastTimestamp || event.eventTime,
        count: event.count || 1,
      }))
      .sort((a, b) => {
        const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
        const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
        return timeB - timeA;
      });

    return { events };
  } catch (error) {
    const k8sError = extractKubernetesError(error);
    return { error: `Failed to fetch events: ${k8sError.message}` };
  }
}

/**
 * Fetch logs for specific containers in a pod
 */
async function fetchPodLogs(
  podName: string,
  namespace: string,
  containerNames: string[],
  lines: number
): Promise<{ logs?: string; error?: string }> {
  if (!containerNames || containerNames.length === 0) {
    return { logs: "No containers found to fetch logs from." };
  }

  try {
    const k8sApi = kubernetesClient.getApiClient();
    const logPromises = containerNames.map(async (container) => {
      try {
        const response = await k8sApi.readNamespacedPodLog(
          podName,
          namespace,
          container, // Explicitly specify container name
          undefined, // follow
          undefined, // insecureSkipTLSVerifyBackend
          undefined, // limitBytes
          undefined, // pretty
          undefined, // previous
          undefined, // sinceSeconds
          lines,     // tailLines (9th arg)
          undefined  // timestamps
        );
        return `=== Container: ${container} ===\n${(response.body || '').trim()}`;
      } catch (error: any) {
        // Don't fail the whole request if one container log fails (e.g. init container cleaned up)
        return `=== Container: ${container} ===\n[Log fetch failed: ${error.message || 'Unknown error'}]`;
      }
    });

    const results = await Promise.all(logPromises);
    return { logs: results.join('\n\n') };
  } catch (error: any) {
    const k8sError = extractKubernetesError(error);
    return { error: `Failed to fetch logs: ${k8sError.message}` };
  }
}

/**
 * Main function to inspect a Kubernetes resource
 */
export async function inspectResource(input: InspectResourceInput): Promise<InspectResourceResponse> {
  // Validate input
  const validatedInput = InspectResourceInputSchema.parse(input);
  const { namespace, resource, name, lines = 30 } = validatedInput;

  // Normalize resource type to lowercase
  const normalizedResourceType = resource.toLowerCase();

  // Log execution
  console.error(`[Server] Executing: kubectl inspect ${resource} ${name} -n ${namespace}`);

  // Check if resource type is supported
  const mapping = RESOURCE_MAPPING[normalizedResourceType];
  if (!mapping) {
    return {
      error: {
        message: `Unsupported resource type: ${resource}. Supported types: ${Object.keys(RESOURCE_MAPPING).sort().join(', ')}`,
      },
      success: false,
    };
  }

  const warnings: string[] = [];
  const response: InspectResourceResponse = { success: true };

  // --- Step 1: Fetch Manifest FIRST (Blocking) ---
  // We need the manifest to know which containers exist
  const manifestResult = await fetchResourceManifest(normalizedResourceType, name, namespace);

  if (manifestResult.manifest) {
    response.manifest = manifestResult.manifest;
  } else if (manifestResult.error) {
    return {
      success: false,
      error: { message: manifestResult.error }
    };
  }

  // --- Step 2: Prepare Parallel Tasks ---
  const tasks: Promise<any>[] = [];

  // Task A: Events (Always fetch)
  const eventsPromise = fetchResourceEvents(resource, name, namespace).then(result => {
    if (result.events) response.events = result.events;
    if (result.error) warnings.push(result.error);
  });
  tasks.push(eventsPromise);

  // Task B: Logs (Only for Pods, using container names from Manifest)
  if (normalizedResourceType === 'pod' || normalizedResourceType === 'pods') {
    const spec = response.manifest?.spec || {};
    const containers = (spec.containers || []).map((c: any) => c.name);
    const initContainers = (spec.initContainers || []).map((c: any) => c.name);
    const allContainers = [...initContainers, ...containers];

    const logsPromise = fetchPodLogs(name, namespace, allContainers, lines).then(result => {
      if (result.logs) response.logs = result.logs;
      if (result.error) warnings.push(result.error);
    });
    tasks.push(logsPromise);
  }

  // --- Step 3: Execute Parallel Tasks ---
  await Promise.all(tasks);

  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return response;
}