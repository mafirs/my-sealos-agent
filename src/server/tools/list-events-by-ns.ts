import { ListEventsByNsInput, ListEventsByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListEventsResponse } from '../kubernetes/types';

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

export async function listEventsByNamespace(input: ListEventsByNsInput): Promise<ListEventsResponse> {
  // Validate input
  const validatedInput = ListEventsByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  // Log execution as required
  console.error(`[Server] Executing: kubectl get events -n ${namespace} --sort-by='.lastTimestamp'`);

  try {
    const k8sApi = kubernetesClient.getApiClient();

    // List Event resources in the specified namespace
    const eventList = await k8sApi.listNamespacedEvent(namespace);

    // Transform Event data and sort by lastTimestamp descending
    const events = eventList.body.items
      .map((event: any) => {
        // Extract involved object info
        const involvedObject = event.involvedObject;
        const objectString = involvedObject
          ? `${involvedObject.kind?.toLowerCase() || 'unknown'}/${involvedObject.name || 'unknown'}`
          : 'unknown/unknown';

        return {
          type: event.type || 'Unknown',
          reason: event.reason || 'Unknown',
          object: objectString,
          message: event.message || 'No message',
          lastTimestamp: event.lastTimestamp ? event.lastTimestamp : event.eventTime,
          count: event.count || 1
        };
      })
      .sort((a, b) => {
        // Sort by lastTimestamp descending (newest first)
        const timeA = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
        const timeB = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
        return timeB - timeA;
      })
      .slice(0, 100); // Limit to first 100 results

    return {
      namespace,
      events,
      total: events.length,
      success: true,
    };
  } catch (error) {
    // Extract meaningful error information
    const k8sError = extractKubernetesError(error);

    // Log structured error
    console.error(`[Server] Error listing events in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    // Return structured error response
    return {
      namespace,
      events: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}