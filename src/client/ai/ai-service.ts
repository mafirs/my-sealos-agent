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
  intent: 'list' | 'inspect';
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

  async parseRawInput(rawArgs: string[], lastContext?: any): Promise<CleanedParameters[] | null> {
    if (!this.enabled) {
      console.error('[Debug] AI Service is disabled');
      return null;
    }

    if (rawArgs.length < 2) {
      console.error('[Debug] Invalid argument count:', rawArgs.length, 'expected at least 2');
      throw new Error(`Expected at least 2 parameters, got ${rawArgs.length}`);
    }

    const systemPrompt = `你是一个严格的数据清洗工具。你的唯一任务是将用户的乱序输入转换为标准 JSON 数组。

【转换规则】
1. 提取 namespace (以 "ns-" 开头)。Node 资源 namespace 默认为 ""。
2. 提取 identifier (固定值 "hzh" 或其他标识符)。
3. 提取 resource，必须根据以下映射表进行标准化（忽略大小写）：
   - obs, bucket, objectstorage -> "objectstorage"
   - cert, certificate -> "certificate"
   - db, cluster -> "cluster"
   - node -> "node"
   - cronjob -> "cronjob"
   - event -> "event"
   - account -> "account"
   - debt -> "debt"
   - pod, pods -> "pods"
   - devbox -> "devbox"
   - ingress -> "ingress"
   - quota -> "quota"
4. 如果输入中未发现任何资源关键词，默认 resource 为 "pods"。
5. 自动去重。

【意图识别】
6. 如果输入包含 describe, desc, inspect, detail, xiangqing, 查看详情 等词，设置 intent 为 "inspect"。
7. 否则默认为 "list"。

【标识符提取】
- inspect 模式：identifier 必须是具体的资源名称（如 mysql-0, my-cluster）。
- list 模式：保持现有逻辑，默认 "hzh"。

【输出要求】
- 必须仅返回纯 JSON 数组字符串。
- 严禁包含 markdown 标记（如 \`\`\`json）。
- 严禁包含任何解释性文字或代码。

【示例】
输入: ["hzh", "obs", "ns-test"]
输出: [{"namespace":"ns-test","resource":"objectstorage","identifier":"hzh","intent":"list"}]

输入: ["ns-m1", "cert", "bucket", "hzh"]
输出: [{"namespace":"ns-m1","resource":"certificate","identifier":"hzh","intent":"list"},{"namespace":"ns-m1","resource":"objectstorage","identifier":"hzh","intent":"list"}]

输入: ["describe", "pod", "mysql-0", "ns-test"]
输出: [{"namespace":"ns-test","resource":"pods","identifier":"mysql-0","intent":"inspect"}]

输入: ["node", "hzh"]
输出: [{"namespace":"","resource":"node","identifier":"hzh","intent":"list"}]`;

    // 在 systemPrompt 定义之后，request 构造之前
    const userMessageParts = [
      { text: `输入参数: ${JSON.stringify(rawArgs)}` }
    ];

    if (lastContext) {
      // 截取前 50000 个字符防止 Token 溢出，作为短期记忆
      const contextStr = JSON.stringify(lastContext).substring(0, 50000);
      userMessageParts.push({
        text: `【上一步工具执行结果（参考上下文）】:\n${contextStr}\n如果用户输入指代不清（如"查看日志"），请根据上下文推断目标资源。`
      });
    }

    userMessageParts.push({ text: "请清洗为标准格式。" });

    const request: AIRequest = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            ...userMessageParts // 使用动态构建的 parts
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
            item && item.resource && item.identifier &&
            (item.namespace || item.resource === 'node') // 允许 node 资源 namespace 为空
          );

          if (validItems.length === 0) {
            return null;
          }

          return validItems.map(item => ({
            namespace: item.namespace,
            resource: item.resource,
            identifier: item.identifier,
            intent: item.intent || 'list'
          }));
        }
        // Handle single object response (backward compatibility)
        else if (parsed.resource && parsed.identifier &&
                 (parsed.namespace || parsed.resource === 'node')) {
          return [{
            namespace: parsed.namespace || '',
            resource: parsed.resource,
            identifier: parsed.identifier,
            intent: parsed.intent || 'list'
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