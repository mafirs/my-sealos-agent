export interface ClientConfig {
  serverCommand?: string;
  serverArgs?: string[];
}

export interface McpToolCall {
  tool: string;
  arguments: Record<string, any>;
}

export interface McpResponse {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

export interface PodDisplayData {
  name: string;
  status: string;
  ip: string;
  node: string;
}

export interface ParsedMcpResponse {
  success: boolean;
  namespace?: string;
  pods?: PodDisplayData[];
  total?: number;
  error?: any;
}