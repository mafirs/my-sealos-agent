export interface PodInfo {
  name: string;
  namespace: string;
  status: string;
  age?: string;
  ip?: string;
  node?: string;
}

export interface KubernetesError {
  code?: number;
  reason?: string;
  message: string;
  details?: any;
}

export interface ListPodsResponse {
  namespace: string;
  pods: PodInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

export interface QuotaInfo {
  name: string;
  namespace: string;
  details: string;
}

export interface ListQuotaResponse {
  namespace: string;
  quotas: QuotaInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

export interface IngressInfo {
  name: string;
  namespace: string;
  hosts: string;
  paths: string;
  backendService: string;
  backendPort: string;
  ingressClass?: string;
  address?: string;
  age?: string;
}

export interface ListIngressResponse {
  namespace: string;
  ingresses: IngressInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

// Node resource types
export interface NodeInfo {
  name: string;
  status: string;
  roles: string;
  age?: string;
  ip?: string;
  osImage?: string;
}

export interface ListNodesResponse {
  nodes: NodeInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

// CronJob resource types
export interface CronJobInfo {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  lastSchedule?: string;
  age?: string;
}

export interface ListCronJobsResponse {
  namespace: string;
  cronjobs: CronJobInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

// Event resource types
export interface EventInfo {
  type: string;
  reason: string;
  object: string;
  message: string;
  lastTimestamp: string;
  count: number;
}

export interface ListEventsResponse {
  namespace: string;
  events: EventInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

// Account resource types
export interface ChargeListItem {
  type: string;
  amount: number;
  currency?: string;
}

export interface AccountStatus {
  type?: string;
  balance?: number;
  creationTime?: string;
  chargeList?: ChargeListItem[];
  [key: string]: any;
}

export interface AccountInfo {
  name: string;
  namespace: string;
  status?: AccountStatus;
  age?: string;
}

export interface ListAccountResponse {
  namespace: string;
  accounts: AccountInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

// Debt resource types
export interface DebtStatusRecord {
  type: string;
  amount: number;
  status: string;
  dueDate?: string;
  [key: string]: any;
}

export interface DebtStatus {
  type?: string;
  totalDebt?: number;
  debtStatusRecords?: DebtStatusRecord[];
  [key: string]: any;
}

export interface DebtInfo {
  name: string;
  namespace: string;
  status?: DebtStatus;
  age?: string;
}

export interface ListDebtResponse {
  namespace: string;
  debts: DebtInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

export interface KubeConfigInfo {
  cluster: string;
  user: string;
  namespace: string;
}

// ObjectStorageBucket resource types
export interface ObjectStorageBucketInfo {
  name: string;
  namespace: string;
  policy: string;
  size: string;
  bucketName: string;
  age?: string;
}

export interface ListObjectStorageBucketResponse {
  namespace: string;
  objectstoragebuckets: ObjectStorageBucketInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}

// Certificate resource types
export interface CertificateInfo {
  name: string;
  namespace: string;
  ready: string;
  secret: string;
  issuer: string;
  notAfter: string;
  age?: string;
}

export interface ListCertificateResponse {
  namespace: string;
  certificates: CertificateInfo[];
  total: number;
  error?: KubernetesError;
  success: boolean;
}