// ViewModel for transforming inspect_resource responses into human-readable format

export interface DetailedContainer {
  name: string;
  image: string;
  imageID: string;
  state: string; // e.g. "Running", "Waiting (Reason)"
  ready: boolean;
  restartCount: number;
  ports: string[];
  env: string[];    // Format: "KEY=VALUE"
  mounts: string[]; // Format: "VolumeName -> ContainerPath"
  resources: string[]; // e.g. "CPU: 100m, Mem: 128Mi"
  args?: string[];
  command?: string[];
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
    age: string;
    node: string;
    ip: string;
    qosClass?: string;
    controlledBy?: string;
  };
  metadata: {
    labels: string[]; // Format: "key=value"
    annotations: string[];
    uid: string;
  };
  conditions: DetailedCondition[];
  containers: DetailedContainer[]; // App containers
  initContainers: DetailedContainer[]; // Init containers
  volumes: string[]; // Format: "Name (Type): Source"
  nodeInfo: {
    selectors: string[];
    tolerations: string[];
  };
  events: Array<{
    time: string;
    type: string;
    reason: string;
    message: string;
  }>;
  config: Array<{ key: string; value: string }>; // For non-pod resources
  logs?: string;
  error?: { message: string; code?: number; reason?: string };
  warnings?: string[];
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


// Helper function to extract metadata
function extractMetadata(metadata: any) {
  return {
    labels: Object.entries(metadata.labels || {}).map(([k, v]) => `${String(k)}=${String(v)}`),
    annotations: Object.entries(metadata.annotations || {})
      .filter(([k]) => !String(k).includes('kubectl.kubernetes.io/'))
      .map(([k, v]) => `${String(k)}=${String(v)}`),
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

// Helper to extract container details
function extractContainerDetails(c: any, statusList: any[] = []): DetailedContainer {
  const cStatus = statusList.find((s: any) => s.name === c.name);

  // State Logic
  let stateStr = 'Unknown';
  if (cStatus?.state?.running) stateStr = `Running (Started: ${cStatus.state.running.startedAt})`;
  else if (cStatus?.state?.waiting) stateStr = `Waiting (${cStatus.state.waiting.reason})`;
  else if (cStatus?.state?.terminated) stateStr = `Terminated (${cStatus.state.terminated.reason}, ExitCode: ${cStatus.state.terminated.exitCode})`;

  // Env Logic
  const envs = (c.env || []).map((e: any) => {
    if (e.valueFrom) return `${e.name} (from reference)`;
    return `${e.name}=${String(e.value)}`;
  });

  // Mounts Logic
  const mounts = (c.volumeMounts || []).map((m: any) => `${m.name} -> ${m.mountPath}`);

  // Resources
  const resources: string[] = [];
  if (c.resources?.requests?.cpu) resources.push(`Req CPU: ${c.resources.requests.cpu}`);
  if (c.resources?.requests?.memory) resources.push(`Req Mem: ${c.resources.requests.memory}`);
  if (c.resources?.limits?.cpu) resources.push(`Lim CPU: ${c.resources.limits.cpu}`);
  if (c.resources?.limits?.memory) resources.push(`Lim Mem: ${c.resources.limits.memory}`);

  return {
    name: String(c.name),
    image: String(c.image),
    imageID: String(cStatus?.imageID || '-'),
    state: stateStr,
    ready: Boolean(cStatus?.ready),
    restartCount: Number(cStatus?.restartCount || 0),
    ports: (c.ports || []).map((p: any) => `${p.containerPort}/${p.protocol || 'TCP'}`),
    env: envs,
    mounts: mounts,
    resources: resources,
    args: c.args ? c.args.map(String) : undefined,
    command: c.command ? c.command.map(String) : undefined
  };
}

// Transformer for Pods
function transformPod(manifest: any, events: any[], logs?: string): InspectViewModel {
  const { metadata = {}, spec = {}, status = {} } = manifest;

  const podStatus = status.phase || 'Unknown';
  const ownerRef = metadata.ownerReferences?.[0];
  const controlledBy = ownerRef ? `${ownerRef.kind}/${ownerRef.name}` : '-';

  // Extract containers separately
  const containers = (spec.containers || []).map((c: any) => extractContainerDetails(c, status.containerStatuses));
  const initContainers = (spec.initContainers || []).map((c: any) => extractContainerDetails(c, status.initContainerStatuses));

  // Volumes
  const volumes = (spec.volumes || []).map((v: any) => {
    let source = 'Unknown';
    if (v.persistentVolumeClaim) source = `PVC: ${v.persistentVolumeClaim.claimName}`;
    else if (v.configMap) source = `ConfigMap: ${v.configMap.name}`;
    else if (v.secret) source = `Secret: ${v.secret.secretName}`;
    else if (v.emptyDir) source = 'EmptyDir';
    else if (v.hostPath) source = `HostPath: ${v.hostPath.path}`;
    else if (v.projected) source = 'Projected';
    return `${v.name} (${source})`;
  });

  // Node Info
  const selectors = Object.entries(spec.nodeSelector || {}).map(([k, v]) => `${k}=${v}`);
  const tolerations = (spec.tolerations || []).map((t: any) => {
    const key = t.key || '';
    const op = t.operator || 'Equal';
    const val = t.value ? `=${t.value}` : '';
    const eff = t.effect ? `:${t.effect}` : '';
    return `${key}${val} (${op})${eff}`;
  });

  // Conditions
  const conditions = (status.conditions || []).map((c: any) => ({
    type: String(c.type),
    status: String(c.status),
    lastTransitionTime: String(c.lastTransitionTime),
    reason: String(c.reason || '-'),
    message: String(c.message || '-')
  }));

  // Events
  const transformedEvents = (events || []).slice(0, 20).map((event: any) => ({
    time: formatEventTime(event.lastTimestamp || event.firstTimestamp),
    type: event.type || 'Normal',
    reason: event.reason || 'Unknown',
    message: event.message || '-'
  }));

  let processedLogs: string | undefined;
  if (logs) {
    // Server already limits lines per container. Do NOT truncate here to avoid losing first containers.
    processedLogs = String(logs);
  }

  return {
    header: {
      kind: 'Pod',
      name: String(metadata.name),
      namespace: String(metadata.namespace),
      status: podStatus,
      statusColor: getStatusColor(podStatus),
      age: calculateAge(metadata.creationTimestamp),
      node: String(spec.nodeName || '-'),
      ip: String(status.podIP || '-'),
      qosClass: String(status.qosClass || '-'),
      controlledBy
    },
    metadata: {
      labels: Object.entries(metadata.labels || {}).map(([k, v]) => `${k}=${v}`),
      annotations: Object.entries(metadata.annotations || {}).filter(([k]) => !k.includes('kubectl')).map(([k, v]) => `${k}=${v}`),
      uid: String(metadata.uid)
    },
    conditions,
    containers,
    initContainers,
    volumes,
    nodeInfo: { selectors, tolerations },
    events: transformedEvents,
    config: [],
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
    initContainers: [],
    volumes: [],
    nodeInfo: { selectors: [], tolerations: [] },
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
      age: calculateAge(creationTimestamp),
      node: '-',
      ip: '-'
    },
    metadata: metadataInfo,
    conditions,
    containers: [], // Clusters don't have containers directly
    initContainers: [],
    volumes: [],
    nodeInfo: { selectors: [], tolerations: [] },
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
      age: calculateAge(creationTimestamp),
      node: '-',
      ip: '-'
    },
    metadata: metadataInfo,
    conditions,
    containers: [], // General resources don't have containers
    initContainers: [],
    volumes: [],
    nodeInfo: { selectors: [], tolerations: [] },
    config,
    events: transformedEvents
  };
}

// Main transformer function
export function transformToViewModel(data: any): InspectViewModel | null {
  try {
    if (data.success === false && data.error) {
      return {
        header: {
          kind: 'Error',
          name: 'Error',
          namespace: '-',
          status: 'Failed',
          statusColor: 'red',
          age: '-',
          node: '-',
          ip: '-'
        },
        metadata: {
          labels: [],
          annotations: [],
          uid: '-'
        },
        conditions: [],
        containers: [],
        initContainers: [],
        volumes: [],
        nodeInfo: { selectors: [], tolerations: [] },
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