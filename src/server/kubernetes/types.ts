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

export interface KubeConfigInfo {
  cluster: string;
  user: string;
  namespace: string;
}