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

export interface KubeConfigInfo {
  cluster: string;
  user: string;
  namespace: string;
}