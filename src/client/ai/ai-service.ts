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
    finishReason?: string;
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

  async parseRawInput(rawArgs: string[]): Promise<CleanedParameters[] | null> {
    if (!this.enabled) {
      console.error('[Debug] AI Service is disabled');
      return null;
    }

    if (rawArgs.length < 2) {
      console.error('[Debug] Invalid argument count:', rawArgs.length, 'expected at least 2');
      throw new Error(`Expected at least 2 parameters, got ${rawArgs.length}`);
    }

    const systemPrompt = `你是一个参数清洗工具。任务是将乱序的输入清洗为 JSON 对象数组。

核心逻辑：
1. 提取公共参数：namespace (ns-开头), identifier (标识符)
2. 识别资源列表：在输入中查找 ["pods", "devbox", "cluster"]，忽略大小写
3. 自动去重（例如输入两个 devbox 只算一个）
4. 如果完全没有发现资源关键词，默认添加 "pods"
5. 笛卡尔积生成：为每一个识别到的资源类型，生成一个独立的对象，共享 namespace 和 identifier

规则：
- identifier: 固定值 "hzh" 或从输入中提取的标识符
- resource: 枚举值 "pods" | "devbox" | "cluster"，支持识别多个资源
- namespace: 以 "ns-" 开头的字符串，如 "ns-mh69tey1"

输入示例：
- ["hzh", "pods", "ns-mh69tey1"] -> [{"namespace":"ns-mh69tey1","resource":"pods","identifier":"hzh"}]
- ["ns-mh69tey1", "devbox", "cluster", "hzh"] -> [{"namespace":"ns-mh69tey1","resource":"devbox","identifier":"hzh"},{"namespace":"ns-mh69tey1","resource":"cluster","identifier":"hzh"}]
- ["ns-m1", "pods", "devbox", "cluster", "hzh"] -> [{"namespace":"ns-m1","resource":"pods","identifier":"hzh"},{"namespace":"ns-m1","resource":"devbox","identifier":"hzh"},{"namespace":"ns-m1","resource":"cluster","identifier":"hzh"}]
- ["ns-m1", "hzh"] -> [{"namespace":"ns-m1","resource":"pods","identifier":"hzh"}]

要求：
1. 返回 JSON 数组，每个对象包含 namespace, resource, identifier 三个字段
2. 如果缺少 namespace，返回 null
3. 资源类型按优先级排序：cluster > devbox > pods
4. 自动去重，避免重复的资源类型
5. 只返回纯 JSON 数组，不要包含 markdown 代码块`;

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
        maxOutputTokens: 8192
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

      const candidate = data.candidates[0];
      const content = candidate?.content?.parts[0]?.text;

      if (!content) {
        return null;
      }

      // Check for truncation and other finish reasons
      const finishReason = candidate?.finishReason;
      switch (finishReason) {
        case 'MAX_TOKENS':
          console.error('[Warning] AI response was truncated due to token limit');
          break;
        case 'SAFETY':
          console.error('[Warning] Response filtered for safety reasons');
          return null;
        case 'RECITATION':
          console.error('[Warning] Response blocked due to recitation');
          return null;
        case 'STOP':
        default:
          console.error('[Debug] Response completed normally');
          break;
      }

      console.error('[Debug] Raw AI Response Length:', content.length);

      // Enhanced Markdown Code Block Removal and Cleaning
      // Handles multiple patterns: ```json, ```, markdown formatting
      let cleanContent = content.replace(/```(?:json)?\n?([\s\S]*?)\n?```/gi, '$1').trim();

      // Remove common markdown formatting that might interfere
      cleanContent = cleanContent
        .replace(/\*\*([^*]+)\*\*/g, '$1')  // **bold** -> bold
        .replace(/\*([^*]+)\*/g, '$1')      // *italic* -> italic
        .replace(/#{1,6}\s+/g, '')           // # headers -> remove
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) -> text
        .replace(/`([^`]+)`/g, '$1')         // `code` -> code
        .trim();

      console.error('[Debug] Cleaned Content Length:', cleanContent.length);

      // Basic JSON structure validation before parsing
      if (!cleanContent.startsWith('[') && !cleanContent.startsWith('{')) {
        console.error('[Debug] Content does not appear to be JSON:', cleanContent);
        return null;
      }

      try {
        const parsed = JSON.parse(cleanContent);

        // Handle array response
        if (Array.isArray(parsed)) {
          // Validate each item in the array
          const validItems = parsed.filter(item =>
            item && item.namespace && item.resource && item.identifier
          );

          if (validItems.length === 0) {
            return null;
          }

          return validItems.map(item => ({
            namespace: item.namespace,
            resource: item.resource,
            identifier: item.identifier
          }));
        }
        // Handle single object response (backward compatibility)
        else if (parsed.namespace && parsed.resource && parsed.identifier) {
          return [{
            namespace: parsed.namespace,
            resource: parsed.resource,
            identifier: parsed.identifier
          }];
        }

        return null;
      } catch (parseError) {
        console.error('[Debug] Failed to parse AI response:', cleanContent);
        console.error('[Debug] JSON Parse Error Details:', {
          error: parseError instanceof Error ? parseError.message : 'Unknown error',
          contentPreview: cleanContent.substring(0, 200),
          contentLength: cleanContent.length
        });
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