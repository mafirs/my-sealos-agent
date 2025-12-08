// Force Node.js to prioritize IPv4 for DNS resolution
// This fixes ENOTFOUND errors in Kubernetes environments (Node.js v17+)
import dns from 'dns';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {
  // Ignore error for older Node.js versions that don't support this method
}

// Load environment variables first - before any other imports
import * as dotenv from 'dotenv';
const result = dotenv.config();
if (result.error) {
  console.warn('[Config] Warning: .env file not found or load failed:', result.error.message);
} else {
  console.error('[Config] .env file loaded successfully');
}

// Other imports...
import { spawn } from 'child_process';
import { CleanedParameters, AIService } from './ai/ai-service';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

async function main() {
  // Initialize services
  const aiService = new AIService();

  // Create readline interface for REPL mode
  const rl = readline.createInterface({
    input,
    output,
    prompt: 'sealos > '
  });

  // Display welcome message
  console.log('[Client] Sealos SRE Agent Interactive Mode');
  console.log('[Client] Usage: Enter "namespace resource identifier" (e.g., "ns-mh69tey1 pods hzh")');
  console.log('[Client] Type "exit" or "quit" to leave\n');

  // Show initial prompt
  rl.prompt();

  // Handle user input
  rl.on('line', async (line) => {
    const input = line.trim();

    // Handle empty input
    if (!input) {
      rl.prompt();
      return;
    }

    // Handle exit commands
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log('[Client] Goodbye!');
      rl.close();
      process.exit(0);
    }

    try {
      // Parse raw parameters
      const rawArgs = input.split(/\s+/);

      // AI cleaning parameters
      console.error('[AI] Processing input...');
      const cleanedParams = await aiService.parseRawInput(rawArgs);

      if (!cleanedParams) {
        console.error('❌ Invalid input. Please provide 3 parameters: namespace, resource, identifier');
        console.error('   Example: ns-mh69tey1 pods hzh');
        rl.prompt();
        return;
      }

      // Execute MCP task
      await runMcpTask(cleanedParams);

    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Continue waiting for next input
    rl.prompt();
  });

  // Handle Ctrl+C
  rl.on('SIGINT', () => {
    console.log('\n[Client] Use "exit" or "quit" to close');
    rl.prompt();
  });
}

// MCP task execution function
async function runMcpTask(params: CleanedParameters) {
  console.error(`\n[Client] Executing: ${params.namespace} ${params.resource} ${params.identifier}`);

  return new Promise<void>((resolve, reject) => {
    // Start MCP Server process
    const server = spawn('npm', ['run', 'start:server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let responseData = '';
    let hasResponded = false;

    // Set timeout
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        server.kill();
        reject(new Error('Request timeout after 30 seconds'));
      }
    }, 30000);

    // Handle Server response
    server.stdout.on('data', (data) => {
      if (hasResponded) return;

      try {
        responseData += data.toString();

        // Try to parse complete JSON response
        const lines = responseData.trim().split('\n');
        for (const line of lines) {
          if (line.startsWith('{') && line.endsWith('}')) {
            try {
              const response = JSON.parse(line);

              // Check for error response first
              if (response.error) {
                console.error('[Server Error Response]', JSON.stringify(response.error, null, 2));
                hasResponded = true;
                clearTimeout(timeout);
                server.kill();
                reject(new Error(`Server returned error: ${response.error.message || 'Unknown error'}`));
                return;
              }

              // Handle successful response
              if (response.result && !hasResponded) {
                hasResponded = true;
                clearTimeout(timeout);
                server.kill();

                // Display results
                displayResults(response.result);
                resolve();
                return;
              }
            } catch (parseError) {
              console.error('[Debug] Failed to parse JSON:', line);
            }
          } else if (line.trim()) {
            console.error('[Server Output]', line);
          }
        }
      } catch (e) {
        // Ignore parsing errors, continue waiting for complete response
      }
    });

    // Handle errors
    server.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString());
    });

    server.on('error', (error) => {
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        reject(error);
      }
    });

    server.on('exit', (code) => {
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`Server exited with code ${code}`));
        } else {
          resolve();
        }
      }
    });

    // Send request
    try {
      const toolName = params.resource === 'cluster' ? 'list_cluster_by_ns'
                     : params.resource === 'devbox' ? 'list_devbox_by_ns'
                     : 'list_pods_by_ns';
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: {
            namespace: params.namespace
          }
        }
      };

      server.stdin.write(JSON.stringify(request) + '\n');
      server.stdin.end();
    } catch (error) {
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        server.kill();
        reject(error);
      }
    }
  });
}

// Result display function (reuse existing logic)
function displayResults(result: any) {
  // Check for content array (MCP format)
  if (result && result.content && result.content.length > 0) {
    const textContent = result.content[0].text;
    try {
      const data = JSON.parse(textContent);

      // 1. ✅ Cluster List Rendering
      if (data.clusters && Array.isArray(data.clusters)) {
        console.log(`\n🗄️  Found ${data.total} clusters (databases) in namespace: ${data.namespace}`);

        const tableData = data.clusters.map((c: any) => ({
          Name: c.name,
          Type: c.type,      // Database type (Redis/MySQL/PostgreSQL...)
          Status: c.status,
          Version: c.version
        }));

        console.table(tableData);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 2. ✅ Devbox List Rendering
      if (data.devboxes && Array.isArray(data.devboxes)) {
        console.log(`\n📦 Found ${data.total} devboxes in namespace: ${data.namespace}`);

        const tableData = data.devboxes.map((d: any) => ({
          Name: d.name,
          Status: d.status,
          Network: JSON.stringify(d.network || {})
        }));

        console.table(tableData);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 2. ✅ Pod List Rendering (Beautiful display)
      if (data.pods && Array.isArray(data.pods)) {
        console.log(`\n🚀 Found ${data.total} pods in namespace: ${data.namespace}`);

        // Extract only core fields for clean table display
        const tableData = data.pods.map((p: any) => ({
          Name: p.name,
          Status: p.status,
          IP: p.ip,
          Node: p.node
        }));

        console.table(tableData);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 2. ❌ Error Handling
      if (data.success === false) {
        console.error(`\n❌ Operation Failed: ${data.error?.message || data.error || 'Unknown error'}`);
        if (data.error?.details) {
          console.error('Details:', JSON.stringify(data.error.details, null, 2));
        }
        return;
      }

      // 3. ⚠️ Fallback (Only show JSON when format is unrecognized)
      console.log('\n📝 Raw Result:');
      console.log(JSON.stringify(data, null, 2));

    } catch (parseError) {
      console.log('\n📋 Raw Response:');
      console.log(textContent);
    }
    return;
  }

  // Legacy format support (result.data)
  if (result && result.data) {
    const { type, data } = result.data;

    switch (type) {
      case 'log':
        console.log('\n📋 Logs:');
        console.log(data.content || data);
        break;

      case 'event':
        console.log('\n⚡ Events:');
        console.table(data);
        break;

      case 'yaml':
        console.log('\n📄 YAML Configuration:');
        console.log('```yaml');
        console.log(data);
        console.log('```');
        break;

      case 'resource_info':
        console.log('\n💡 Resource Information:');
        console.log(data);
        break;

      case 'error':
        console.error('\n❌ Error:', data);
        break;

      default:
        console.log('\n📊 Result:');
        console.log(JSON.stringify(data, null, 2));
    }
    return;
  }

  // Fallback for other formats
  console.error('No valid content in response');
  console.log('Raw response:', JSON.stringify(result, null, 2));
}

// Start the program
main().catch(error => {
  console.error('[Client] Fatal error:', error);
  process.exit(1);
});