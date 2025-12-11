// ViewModel for transforming inspect_resource responses into human-readable format
export interface InspectViewModel {
  header: {
    kind: string;
    name: string;
    namespace: string;
    status: string;
    statusColor: 'green' | 'red' | 'yellow' | 'gray';
    age?: string;
    node?: string;
    ip?: string;
  };
  config: Array<{ key: string; value: string }>;
  events: Array<{
    time: string;
    type: string;
    reason: string;
    message: string;
  }>;
  logs?: string;
  warnings?: string[];
  error?: {
    message: string;
    code?: number;
    reason?: string;
  };
}

// Helper function to calculate age from timestamp
function calculateAge(creationTimestamp?: string): string {
  if (!creationTimestamp) return '-';
  const created = new Date(creationTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffDays > 0) return `${diffDays}d${diffHours}h`;
  if (diffHours > 0) return `${diffHours}h${diffMinutes}m`;
  return `${diffMinutes}m`;
}

// Helper function to format event time
function formatEventTime(timestamp?: string): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `[${hours}:${minutes}:${seconds}]`;
}

// Helper function to determine status color
function getStatusColor(status?: string): 'green' | 'red' | 'yellow' | 'gray' {
  if (!status) return 'gray';
  const statusLower = status.toLowerCase();
  // Green: Running, Ready, Succeeded, Healthy
  if (['running', 'ready', 'succeeded', 'healthy', 'active'].includes(statusLower)) return 'green';
  // Red: Failed, Error, CrashLoop, Abnormal
  if (['failed', 'error', 'crashloopbackoff', 'unhealthy', 'abnormal'].includes(statusLower)) return 'red';
  // Yellow: Pending, Creating, Stopped, Terminating
  if (['pending', 'starting', 'creating', 'stopped', 'terminating', 'containercreating'].includes(statusLower)) return 'yellow';
  return 'gray';
}

// Transformer for Pods
function transformPod(manifest: any, events: any[], logs?: string): InspectViewModel {
  const { metadata = {}, spec = {}, status = {} } = manifest;
  const { name = '', namespace = '', creationTimestamp } = metadata;

  const podStatus = status.phase || 'Unknown';
  const nodeName = status.nodeName || spec.nodeName || '-';
  const podIP = status.podIP || '-';

  const config: Array<{ key: string; value: string }> = [];

  if (spec.containers && spec.containers.length > 0) {
    const container = spec.containers[0];
    if (container.image) {
      config.push({ key: 'Image', value: String(container.image) });
    }
  }

  if (status.containerStatuses && status.containerStatuses.length > 0) {
    const restartCount = status.containerStatuses.reduce(
      (sum: number, cs: any) => sum + (Number(cs.restartCount) || 0), 0
    );
    config.push({ key: 'Restart Count', value: String(restartCount) });
  }

  if (spec.containers && spec.containers.length > 0) {
    const container = spec.containers[0];
    if (container.resources) {
      if (container.resources.requests) {
        if (container.resources.requests.cpu) config.push({ key: 'CPU Request', value: String(container.resources.requests.cpu) });
        if (container.resources.requests.memory) config.push({ key: 'Memory Request', value: String(container.resources.requests.memory) });
      }
      if (container.resources.limits) {
        if (container.resources.limits.cpu) config.push({ key: 'CPU Limit', value: String(container.resources.limits.cpu) });
        if (container.resources.limits.memory) config.push({ key: 'Memory Limit', value: String(container.resources.limits.memory) });
      }
    }
  }

  const transformedEvents = (events || []).slice(0, 20).map((event: any) => ({
    time: formatEventTime(event.lastTimestamp || event.firstTimestamp),
    type: event.type || 'Normal',
    reason: event.reason || 'Unknown',
    message: event.message || '-'
  }));

  let processedLogs: string | undefined;
  if (logs) {
    const logLines = String(logs).split('\n');
    processedLogs = logLines.slice(-20).join('\n');
  }

  return {
    header: { kind: 'Pod', name, namespace, status: podStatus, statusColor: getStatusColor(podStatus), age: calculateAge(creationTimestamp), node: nodeName, ip: podIP },
    config,
    events: transformedEvents,
    logs: processedLogs
  };
}

// Transformer for Sealos Devbox
function transformDevbox(manifest: any, events: any[]): InspectViewModel {
  const { metadata = {}, spec = {}, status = {} } = manifest;
  const { name = '', namespace = '', creationTimestamp } = metadata;

  const devboxStatus = status.phase || 'Unknown';
  const nodePort = status?.network?.nodePort;

  const config: Array<{ key: string; value: string }> = [];

  if (spec.template) config.push({ key: 'Template', value: String(spec.template) });
  if (spec.cpu) config.push({ key: 'CPU', value: String(spec.cpu) });
  if (spec.memory) config.push({ key: 'Memory', value: String(spec.memory) });
  if (nodePort) config.push({ key: 'SSH Port', value: String(nodePort) });
  if (status?.network?.host) config.push({ key: 'Host', value: String(status.network.host) });
  if (status?.user) config.push({ key: 'User', value: String(status.user) });

  const transformedEvents = (events || []).slice(0, 20).map((event: any) => ({
    time: formatEventTime(event.lastTimestamp || event.firstTimestamp),
    type: event.type || 'Normal',
    reason: event.reason || 'Unknown',
    message: event.message || '-'
  }));

  return {
    header: { kind: 'Devbox', name, namespace, status: devboxStatus, statusColor: getStatusColor(devboxStatus), age: calculateAge(creationTimestamp), node: '-', ip: nodePort ? `:${nodePort}` : '-' },
    config,
    events: transformedEvents
  };
}

// Transformer for KubeBlocks Cluster
function transformCluster(manifest: any, events: any[]): InspectViewModel {
  const { metadata = {}, spec = {}, status = {} } = manifest;
  const { name = '', namespace = '', creationTimestamp } = metadata;

  const clusterStatus = status.phase || 'Unknown';
  const config: Array<{ key: string; value: string }> = [];

  if (spec.clusterDefinitionRef) config.push({ key: 'Definition', value: String(spec.clusterDefinitionRef) });
  if (spec.clusterVersionRef) config.push({ key: 'Version', value: String(spec.clusterVersionRef) });

  if (status.componentStatuses && Array.isArray(status.componentStatuses)) {
    config.push({ key: 'Components', value: String(status.componentStatuses.length) });
    status.componentStatuses.forEach((comp: any) => {
      if (comp.name) {
        config.push({ key: `  └─ ${comp.name}`, value: String(comp.phase || 'Unknown') });
      }
    });
  }
  if (status.endpoint) config.push({ key: 'Endpoint', value: String(status.endpoint) });

  const transformedEvents = (events || []).slice(0, 20).map((event: any) => ({
    time: formatEventTime(event.lastTimestamp || event.firstTimestamp),
    type: event.type || 'Normal',
    reason: event.reason || 'Unknown',
    message: event.message || '-'
  }));

  return {
    header: { kind: 'Cluster', name, namespace, status: clusterStatus, statusColor: getStatusColor(clusterStatus), age: calculateAge(creationTimestamp) },
    config,
    events: transformedEvents
  };
}

// General transformer
function transformGeneral(manifest: any, events: any[]): InspectViewModel {
  const { metadata = {}, spec = {}, status = {} } = manifest;
  const { name = '', namespace = '', creationTimestamp, kind = 'Resource' } = metadata;

  let resourceStatus = status.phase || status.status || 'Unknown';
  if (status.conditions && Array.isArray(status.conditions)) {
    const readyCondition = status.conditions.find((c: any) => c.type === 'Ready' || c.type === 'Available');
    if (readyCondition) {
      resourceStatus = readyCondition.status === 'True' ? 'Ready' : 'NotReady';
    }
  }

  const config: Array<{ key: string; value: string }> = [];
  ['replicas', 'parallelism', 'schedule', 'type'].forEach(field => {
    if (spec[field] !== undefined) config.push({ key: field.charAt(0).toUpperCase() + field.slice(1), value: String(spec[field]) });
  });
  ['replicas', 'readyReplicas', 'availableReplicas'].forEach(field => {
    if (status[field] !== undefined) config.push({ key: field.replace(/([A-Z])/g, ' $1').trim(), value: String(status[field]) });
  });

  const transformedEvents = (events || []).slice(0, 20).map((event: any) => ({
    time: formatEventTime(event.lastTimestamp || event.firstTimestamp),
    type: event.type || 'Normal',
    reason: event.reason || 'Unknown',
    message: event.message || '-'
  }));

  return {
    header: { kind, name, namespace, status: resourceStatus, statusColor: getStatusColor(resourceStatus), age: calculateAge(creationTimestamp) },
    config,
    events: transformedEvents
  };
}

// Main transformer function
export function transformToViewModel(data: any): InspectViewModel | null {
  try {
    if (data.success === false && data.error) {
      return {
        header: { kind: 'Error', name: 'Error', namespace: '-', status: 'Failed', statusColor: 'red' },
        config: [], events: [], error: { message: data.error.message || 'Unknown error', code: data.error.code, reason: data.error.reason }, warnings: data.warnings
      };
    }
    const { manifest, events = [], logs } = data;
    if (!manifest) return null;

    const kind = manifest.kind || '';
    const lowerKind = kind.toLowerCase();

    if (lowerKind === 'pod') return transformPod(manifest, events, logs);
    if (lowerKind === 'devbox') return transformDevbox(manifest, events);
    if (lowerKind === 'cluster') return transformCluster(manifest, events);
    return transformGeneral(manifest, events);
  } catch (error) {
    console.error('Error transforming inspect data:', error);
    return null;
  }
}