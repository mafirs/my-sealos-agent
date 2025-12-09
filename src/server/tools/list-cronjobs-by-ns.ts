import { ListCronjobsByNsInput, ListCronjobsByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListCronJobsResponse } from '../kubernetes/types';
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

export async function listCronjobsByNamespace(input: ListCronjobsByNsInput): Promise<ListCronJobsResponse> {
  // Validate input
  const validatedInput = ListCronjobsByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  // Log execution as required
  console.error(`[Server] Executing: kubectl get cronjobs -n ${namespace}`);

  try {
    const batchV1Api = kubernetesClient.getBatchV1Api();

    // List CronJob resources in the specified namespace
    const cronjobList = await batchV1Api.listNamespacedCronJob(namespace);

    // Transform CronJob data
    const cronjobs = cronjobList.body.items.map((cronjob: k8s.V1CronJob) => {
      // Extract schedule
      const schedule = cronjob.spec?.schedule || '-';

      // Extract suspend status
      const suspend = cronjob.spec?.suspend || false;

      // Extract active jobs count
      const active = cronjob.status?.active?.length || 0;

      // Extract last schedule time
      const lastSchedule = cronjob.status?.lastScheduleTime
        ? new Date(cronjob.status.lastScheduleTime).toISOString()
        : undefined;

      // Calculate age
      const age = cronjob.metadata?.creationTimestamp
        ? calculateAge(new Date(cronjob.metadata.creationTimestamp))
        : undefined;

      return {
        name: cronjob.metadata?.name || 'unknown',
        namespace: cronjob.metadata?.namespace || namespace,
        schedule: schedule,
        suspend: suspend,
        active: active,
        lastSchedule: lastSchedule,
        age: age
      };
    });

    return {
      namespace,
      cronjobs,
      total: cronjobs.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error
    console.error(`[Server] Error listing cronjobs in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response
    return {
      namespace,
      cronjobs: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}