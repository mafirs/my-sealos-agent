// ViewModel for transforming inspect_resource responses into human-readable format

export interface DetailedContainer {
  name: string;
  image: string;
  state: string; // e.g. "Running", "Waiting (Reason)"
  ready: boolean;
  restartCount: number;
  ports: string[];
  env: string[];    // Format: "KEY=VALUE" (or "KEY (from Secret)")
  mounts: string[]; // Format: "VolumeName -> ContainerPath"
  resources: string[]; // e.g. "CPU: 100m, Mem: 128Mi"
}

export interface DetailedCondition {
  type: string;
  status: string;
  lastTransitionTime: string;
  reason: string;
  message: string;
}

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
  metadata: {
    labels: string[]; // Format: "key=value"
    annotations: string[];
    ownerReferences: string[];
    uid: string;
  };
  conditions: DetailedCondition[];
  containers: DetailedContainer[]; // Include InitContainers if present
  config: Array<{ key: string; value: string }>; // Keep for non-Pod resources
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

// Helper function to get container state
function getContainerState(containerStatus: any): string {
  if (!containerStatus) return 'Unknown';

  if (containerStatus.state?.running) {
    return 'Running';
  } else if (containerStatus.state?.waiting) {
    const reason = containerStatus.state.waiting.reason;
    return reason ? `Waiting (${reason})` : 'Waiting';
  } else if (containerStatus.state?.terminated) {
    const reason = containerStatus.state.terminated.reason;
    const exitCode = containerStatus.state.terminated.exitCode;
    if (reason) {
      return `Terminated (${reason}, exit code: ${exitCode})`;
    }
    return `Terminated (exit code: ${exitCode})`;
  }

  return 'Unknown';
}

// Helper function to extract container ports
function extractPorts(container: any): string[] {
  if (!container.ports || !Array.isArray(container.ports)) return [];

  return container.ports.map((port: any) => {
    const protocol = String(port.protocol || 'TCP');
    const portNum = String(port.containerPort || port.port || '-');
    const hostPort = port.hostPort ? `:${String(port.hostPort)}` : '';
    const name = port.name ? ` (${String(port.name)})` : '';
    return `${protocol}${portNum}${hostPort}${name}`;
  });
}

// Helper function to extract environment variables
function extractEnvVars(container: any): string[] {
  if (!container.env || !Array.isArray(container.env)) return [];

  return container.env.map((env: any) => {
    if (env.valueFrom) {
      // Reference to secret/configmap
      const source = env.valueFrom.secretKeyRef ?
        `Secret:${String(env.valueFrom.secretKeyRef.name)}.${String(env.valueFrom.secretKeyRef.key)}` :
        env.valueFrom.configMapKeyRef ?
          `ConfigMap:${String(env.valueFrom.configMapKeyRef.name)}.${String(env.valueFrom.configMapKeyRef.key)}` :
          env.valueFrom.fieldRef ?
            `FieldRef:${String(env.valueFrom.fieldRef.fieldPath)}` :
          'Unknown';
      return `${String(env.name)} (from ${source})`;
    }
    return `${String(env.name)}=${String(env.value || '')}`;
  });
}

// Helper function to extract volume mounts
function extractMounts(container: any): string[] {
  if (!container.volumeMounts || !Array.isArray(container.volumeMounts)) return [];

  return container.volumeMounts.map((mount: any) =>
    `${String(mount.name)} -> ${String(mount.mountPath)}`
  );
}

// Helper function to extract resource requirements
function extractResources(container: any): string[] {
  const resources: string[] = [];

  if (container.resources) {
    // Requests
    if (container.resources.requests) {
      if (container.resources.requests.cpu) {
        resources.push(`CPU Request: ${String(container.resources.requests.cpu)}`);
      }
      if (container.resources.requests.memory) {
        resources.push(`Memory Request: ${String(container.resources.requests.memory)}`);
      }
    }

    // Limits
    if (container.resources.limits) {
      if (container.resources.limits.cpu) {
        resources.push(`CPU Limit: ${String(container.resources.limits.cpu)}`);
      }
      if (container.resources.limits.memory) {
        resources.push(`Memory Limit: ${String(container.resources.limits.memory)}`);
      }
    }
  }

  return resources;
}

// Helper function to extract metadata
function extractMetadata(metadata: any) {
  return {
    labels: Object.entries(metadata.labels || {}).map(([k, v]) => `${String(k)}=${String(v)}`),
    annotations: Object.entries(metadata.annotations || {})
      .filter(([k]) => !String(k).includes('kubectl.kubernetes.io/'))
      .map(([k, v]) => `${String(k)}=${String(v)}`),
    ownerReferences: (metadata.ownerReferences || []).map((ref: any) =>
      `${String(ref.kind || 'Unknown')}/${String(ref.name || 'unknown')} (UID: ${String(ref.uid || 'unknown')})`
    ),
    uid: String(metadata.uid || '-')
  };
}

// Helper function to extract conditions
function extractConditions(status: any): DetailedCondition[] {
  const conditions: DetailedCondition[] = [];
  if (status.conditions && Array.isArray(status.conditions)) {
    status.conditions.forEach((condition: any) => {
      conditions.push({
        type: String(condition.type || 'Unknown'),
        status: String(condition.status || 'Unknown'),
        lastTransitionTime: String(condition.lastTransitionTime || '-'),
        reason: String(condition.reason || '-'),
        message: String(condition.message || '-')
      });
    });
  }
  return conditions;
}

// Transformer for Pods
function transformPod(manifest: any, events: any[], logs?: string): InspectViewModel {
  const { metadata = {}, spec = {}, status = {} } = manifest;
  const { name = '', namespace = '', creationTimestamp } = metadata;

  const podStatus = status.phase || 'Unknown';
  const nodeName = status.nodeName || spec.nodeName || '-';
  const podIP = status.podIP || '-';

  // Extract container information
  const detailedContainers: DetailedContainer[] = [];

  // Regular containers
  if (spec.containers) {
    spec.containers.forEach((container: any) => {
      // IMPORTANT: Match by name, not index, for safety
      const containerStatus = status.containerStatuses?.find((cs: any) => cs.name === container.name);

      detailedContainers.push({
        name: String(container.name),
        image: String(container.image || '-'),
        state: getContainerState(containerStatus),
        ready: Boolean(containerStatus?.ready || false),
        restartCount: Number(containerStatus?.restartCount || 0),
        ports: extractPorts(container),
        env: extractEnvVars(container),
        mounts: extractMounts(container),
        resources: extractResources(container)
      });
    });
  }

  // Init containers
  if (spec.initContainers) {
    spec.initContainers.forEach((container: any) => {
      // Match by name for init containers too
      const containerStatus = status.initContainerStatuses?.find((cs: any) => cs.name === container.name);

      detailedContainers.push({
        name: String(container.name),
        image: String(container.image || '-'),
        state: getContainerState(containerStatus),
        ready: Boolean(containerStatus?.ready || false),
        restartCount: Number(containerStatus?.restartCount || 0),
        ports: extractPorts(container),
        env: extractEnvVars(container),
        mounts: extractMounts(container),
        resources: extractResources(container)
      });
    });
  }

  // Extract conditions and metadata
  const conditions = extractConditions(status);
  const metadataInfo = extractMetadata(metadata);

  // Transform events
  const transformedEvents = (events || []).slice(0, 20).map((event: any) => ({
    time: formatEventTime(event.lastTimestamp || event.firstTimestamp),
    type: event.type || 'Normal',
    reason: event.reason || 'Unknown',
    message: event.message || '-'
  }));

  // Process logs
  let processedLogs: string | undefined;
  if (logs) {
    const logLines = String(logs).split('\n');
    processedLogs = logLines.slice(-20).join('\n');
  }

  return {
    header: {
      kind: 'Pod',
      name,
      namespace,
      status: podStatus,
      statusColor: getStatusColor(podStatus),
      age: calculateAge(creationTimestamp),
      node: nodeName,
      ip: podIP
    },
    metadata: metadataInfo,
    conditions,
    containers: detailedContainers,
    config: [], // Pods use containers section instead
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

  // Extract metadata and conditions
  const metadataInfo = extractMetadata(metadata);
  const conditions = extractConditions(status);

  return {
    header: {
      kind: 'Devbox',
      name,
      namespace,
      status: devboxStatus,
      statusColor: getStatusColor(devboxStatus),
      age: calculateAge(creationTimestamp),
      node: '-',
      ip: nodePort ? `:${nodePort}` : '-'
    },
    metadata: metadataInfo,
    conditions,
    containers: [], // Devbox doesn't have containers in the traditional sense
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

  // Extract metadata and conditions
  const metadataInfo = extractMetadata(metadata);
  const conditions = extractConditions(status);

  return {
    header: {
      kind: 'Cluster',
      name,
      namespace,
      status: clusterStatus,
      statusColor: getStatusColor(clusterStatus),
      age: calculateAge(creationTimestamp)
    },
    metadata: metadataInfo,
    conditions,
    containers: [], // Clusters don't have containers directly
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

  // Extract metadata and conditions
  const metadataInfo = extractMetadata(metadata);
  const conditions = extractConditions(status);

  return {
    header: {
      kind,
      name,
      namespace,
      status: resourceStatus,
      statusColor: getStatusColor(resourceStatus),
      age: calculateAge(creationTimestamp)
    },
    metadata: metadataInfo,
    conditions,
    containers: [], // General resources don't have containers
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
        metadata: {
          labels: [],
          annotations: [],
          ownerReferences: [],
          uid: '-'
        },
        conditions: [],
        containers: [],
        config: [],
        events: [],
        error: { message: data.error.message || 'Unknown error', code: data.error.code, reason: data.error.reason },
        warnings: data.warnings
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