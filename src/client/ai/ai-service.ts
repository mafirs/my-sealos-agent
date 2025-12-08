export interface AIRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

export interface AIResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

export interface CleanedParameters {
  namespace: string;
  resource: string;
  identifier: string;
}

export class AIService {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private enabled: boolean;

  constructor() {
    // Debug: Environment variable loading status
    console.error('[Debug] AI Service Environment Check:');
    console.error(`  - AI_API_KEY: ${this.maskApiKey(process.env.AI_API_KEY)}`);
    console.error(`  - AI_BASE_URL: ${process.env.AI_BASE_URL || 'NOT SET (will use default)'}`);
    console.error(`  - AI_MODEL: ${process.env.AI_MODEL || 'NOT SET (will use default)'}`);
    console.error(`  - AI_ENABLED: ${process.env.AI_ENABLED || 'NOT SET (will use default)'}`);

    this.baseUrl = process.env.AI_BASE_URL || 'https://aiproxy.usw.sealos.io';
    this.apiKey = process.env.AI_API_KEY || '';
    this.model = process.env.AI_MODEL || 'gemini-2.5-flash';
    this.enabled = process.env.AI_ENABLED === 'true' && this.apiKey !== '';

    console.error('[Debug] AI Service Configuration:');
    console.error(`  - Base URL: ${this.baseUrl}`);
    console.error(`  - Model: ${this.model}`);
    console.error(`  - API Key: ${this.maskApiKey(this.apiKey)}`);
    console.error(`  - Service Enabled: ${this.enabled}`);
  }

  private maskApiKey(key?: string): string {
    if (!key) return 'NOT SET';
    if (key.length <= 8) return '***';
    return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
  }

  async parseRawInput(rawArgs: string[]): Promise<CleanedParameters | null> {
    if (!this.enabled) {
      console.error('[Debug] AI Service is disabled');
      return null;
    }

    if (rawArgs.length !== 3) {
      console.error('[Debug] Invalid argument count:', rawArgs.length, 'expected 3');
      throw new Error(`Expected exactly 3 parameters, got ${rawArgs.length}`);
    }

    const systemPrompt = `你是一个参数清洗工具。任务是将乱序的三参数输入清洗为标准 JSON 格式。

规则：
- identifier: 固定值 "hzh"
- resource: 枚举值 "pods" | "devbox" | "cluster"（如果输入包含 cluster，则返回 "cluster"；如果包含 devbox，则返回 "devbox"；否则返回 "pods"）
- namespace: 以 "ns-" 开头的字符串，如 "ns-mh69tey1"

输入示例：
- ["hzh", "pods", "ns-mh69tey1"] -> {"namespace": "ns-mh69tey1", "resource": "pods", "identifier": "hzh"}
- ["ns-mh69tey1", "devbox", "hzh"] -> {"namespace": "ns-mh69tey1", "resource": "devbox", "identifier": "hzh"}
- ["cluster", "ns-mh69tey1", "hzh"] -> {"namespace": "ns-mh69tey1", "resource": "cluster", "identifier": "hzh"}

要求：
1. 严格按照三个必需字段返回
2. 如果缺少任一必需参数，返回 null
3. 如果输入包含 "cluster"（忽略大小写），resource 必须返回 "cluster"
4. 如果输入包含 "devbox"（忽略大小写），resource 必须返回 "devbox"
5. resource 必须保持单数形式，不要返回 "clusters"
6. 只返回纯 JSON，不要包含 markdown 代码块`;

    const request: AIRequest = {
      contents: [
        {
          parts: [
            {
              text: systemPrompt
            },
            {
              text: `输入参数: ${JSON.stringify(rawArgs)}\n请清洗为标准格式。`
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    };

    try {
      const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent`; // Remove ?key=...

      console.error('[Debug] AI API Request:');
      console.error(`  - URL: ${url}`); // No need to mask, URL doesn't contain key
      console.error(`  - Arguments: [${rawArgs.join(', ')}]`);
      console.error(`  - Authorization Header: Bearer ${this.maskApiKey(this.apiKey)}`);
      console.error(`  - Request Body: ${JSON.stringify(request, null, 2)}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}` // Add Authorization header
        },
        body: JSON.stringify(request)
      });

      console.error(`[Debug] AI API Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        // Try to read error response body for more debugging info
        let errorBody = '';
        try {
          errorBody = await response.text();
          console.error('[Debug] Error Response Body:', errorBody);
        } catch (e) {
          console.error('[Debug] Could not read error response body');
        }

        throw new Error(`AI API error: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody}` : ''}`);
      }

      const data = await response.json() as AIResponse;
      console.error('[Debug] AI API Success Response:', JSON.stringify(data, null, 2));
      const content = data.candidates[0]?.content?.parts[0]?.text;

      if (!content) {
        return null;
      }

      // 清理响应，移除可能的 markdown 代码块
      const cleanContent = content.replace(/```json\s*|\s*```/g, '').trim();

      try {
        const parsed = JSON.parse(cleanContent);

        // 验证必需字段
        if (parsed.namespace && parsed.resource && parsed.identifier) {
          return {
            namespace: parsed.namespace,
            resource: parsed.resource,
            identifier: parsed.identifier
          };
        }

        return null;
      } catch (parseError) {
        console.warn('Failed to parse AI response:', cleanContent);
        return null;
      }
    } catch (error) {
      console.error('[Debug] AI API Request Failed:', error);
      console.error('AI service error:', error);
      return null;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}