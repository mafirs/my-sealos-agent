import { ListCertificateByNsInput, ListCertificateByNsInputSchema } from './types';
import { kubernetesClient } from '../kubernetes/client';
import { KubernetesError, ListCertificateResponse } from '../kubernetes/types';

/**
 * Calculate days remaining from notAfter date
 */
function calculateDaysRemaining(notAfter: string): string {
  const now = new Date();
  const expiryDate = new Date(notAfter);
  const diff = expiryDate.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return 'Expired';
  }
  return `${days}d left`;
}

/**
 * Check certificate readiness from conditions
 */
function getReadyStatus(conditions: any[]): string {
  if (!conditions || conditions.length === 0) {
    return 'Unknown';
  }

  const readyCondition = conditions.find((cond: any) => cond.type === 'Ready');
  if (readyCondition) {
    return readyCondition.status === 'True' ? 'True' : 'False';
  }

  return 'Unknown';
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

export async function listCertificateByNamespace(input: ListCertificateByNsInput): Promise<ListCertificateResponse> {
  const validatedInput = ListCertificateByNsInputSchema.parse(input);
  const { namespace } = validatedInput;

  console.error(`[Server] Executing: kubectl get certificates -n ${namespace}`);

  try {
    const customObjectsApi = kubernetesClient.getCustomObjectsApi();

    const certificateList = await customObjectsApi.listNamespacedCustomObject(
      'cert-manager.io',  // group
      'v1',               // version
      namespace,          // namespace
      'certificates'      // plural
    );

    const certificates = (certificateList.body as any).items?.map((cert: any) => {
      const name = cert.metadata?.name || 'unknown';
      const certNamespace = cert.metadata?.namespace || namespace;
      const ready = getReadyStatus(cert.status?.conditions || []);
      const secret = cert.spec?.secretName || 'unknown';
      const issuer = cert.spec?.issuerRef?.name || 'unknown';
      const notAfter = cert.status?.notAfter ? calculateDaysRemaining(cert.status.notAfter) : 'unknown';

      const age = cert.metadata?.creationTimestamp
        ? calculateAge(cert.metadata.creationTimestamp)
        : undefined;

      return {
        name: name,
        namespace: certNamespace,
        ready: ready,
        secret: secret,
        issuer: issuer,
        notAfter: notAfter,
        age: age
      };
    }) || [];

    return {
      namespace,
      certificates,
      total: certificates.length,
      success: true,
    };
  } catch (error) {
    const k8sError = extractKubernetesError(error);

    console.error(`[Server] Error listing certificates in namespace ${namespace}:`, {
      code: k8sError.code,
      reason: k8sError.reason,
      message: k8sError.message,
    });

    return {
      namespace,
      certificates: [],
      total: 0,
      error: k8sError,
      success: false,
    };
  }
}