// Force Node.js to prioritize IPv4 for DNS resolution
// This fixes ENOTFOUND errors in Kubernetes environments (Node.js v17+)
import * as dns from 'dns';

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
import { spawn, ChildProcess } from 'child_process';
import { CleanedParameters, AIService } from './ai/ai-service';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

// Global variables for process tracking
let activeMcpServers = new Set<ChildProcess>();
let mainReadlineInterface: readline.Interface | null = null;
let lastSigintTime = 0;

function cleanupAndExit(code: number) {
  // Kill all active MCP server processes
  activeMcpServers.forEach(server => {
    try {
      if (!server.killed) {
        server.kill('SIGTERM');
        // Force kill after 3 seconds
        setTimeout(() => {
          if (!server.killed) {
            server.kill('SIGKILL');
          }
        }, 3000);
      }
    } catch (error) {
      console.error('[Client] Error killing server process:', error);
    }
  });

  // Close readline interface
  if (mainReadlineInterface) {
    mainReadlineInterface.close();
  }

  // Exit with the specified code
  process.exit(code);
}

async function main() {
  // Initialize services
  const aiService = new AIService();

  // Create readline interface for REPL mode
  const rl = readline.createInterface({
    input,
    output,
    prompt: 'sealos > '
  });

  // Store reference for cleanup
  mainReadlineInterface = rl;

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
      cleanupAndExit(0);
      return;
    }

    try {
      // Parse raw parameters
      const rawArgs = input.split(/\s+/);

      // AI cleaning parameters
      console.error('[AI] Processing input...');
      const cleanedParamsList = await aiService.parseRawInput(rawArgs);

      if (!cleanedParamsList || cleanedParamsList.length === 0) {
        console.error('❌ Invalid input. Please provide at least: [namespace, resource, identifier] OR [resource, identifier] for nodes');
        console.error('   Examples: ns-mh69tey1 pods hzh');
        console.error('             node hzh');
        rl.prompt();
        return;
      }

      // Execute MCP tasks (parallel or single based on array length)
      if (cleanedParamsList.length === 1) {
        // Single resource - use legacy function for backward compatibility
        await runMcpTaskLegacy(cleanedParamsList[0]);
      } else {
        // Multiple resources - use parallel execution
        console.error(`[Client] Querying ${cleanedParamsList.length} resource types in parallel...`);
        const results = await runMcpTask(cleanedParamsList);
        displayAggregatedResults(results);
      }

    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
    }

    // Continue waiting for next input
    rl.prompt();
  });

  // Handle Ctrl+C with shell-like behavior
  rl.on('SIGINT', () => {
    const now = Date.now();

    // If there's text in the current line, just clear it (like bash)
    if (rl.line.length > 0) {
      // 1. Visual feedback: print ^C and move to new line
      process.stdout.write('^C\n');

      // 2. Internal State Reset (CRITICAL FIX):
      // We must forcefully clear the internal buffer and cursor.
      // Casting to 'any' is necessary because TS types mark these as readonly,
      // but in Node.js runtime they are writable and essential for this reset.
      (rl as any).line = '';
      (rl as any).cursor = 0;

      // 3. Show new prompt
      rl.prompt();
      return;
    }

    // If line is empty, this is an exit attempt
    const timeSinceLastSigint = now - lastSigintTime;
    lastSigintTime = now;

    if (timeSinceLastSigint < 2000) {
      // Double press - exit immediately
      console.log('\n[Client] Exiting...');
      cleanupAndExit(0);
    } else {
      // First press - show exit hint
      console.log('\n[Client] Press Ctrl+C again or type "exit" to quit');
      rl.prompt();
    }
  });
}

// Resource to tool mapping
const TOOL_MAPPING: Record<string, string> = {
  'cluster': 'list_cluster_by_ns',
  'node': 'list_nodes',
  'account': 'list_account_by_ns',
  'debt': 'list_debt_by_ns',
  'devbox': 'list_devbox_by_ns',
  'cronjob': 'list_cronjobs_by_ns',
  'pods': 'list_pods_by_ns',
  'ingress': 'list_ingress_by_ns',
  'event': 'list_events_by_ns',
  'quota': 'list_quota_by_ns'
};

// Single MCP task execution (helper for parallel execution)
async function executeSingleMcpTask(params: CleanedParameters): Promise<{resource: string, result?: any, error?: string}> {
  console.error(`\n[Client] Executing: ${params.namespace} ${params.resource} ${params.identifier}`);

  return new Promise((resolve) => {
    // Start MCP Server process
    const server = spawn('npm', ['run', 'start:server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    // Track the server process
    activeMcpServers.add(server);

    // Remove from tracking when the process exits
    server.on('exit', () => {
      activeMcpServers.delete(server);
    });

    let responseData = '';
    let hasResponded = false;

    // Set timeout
    const timeout = setTimeout(() => {
      if (!hasResponded) {
        hasResponded = true;
        server.kill();
        resolve({
          resource: params.resource,
          error: `Request timeout after 30 seconds`
        });
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
                resolve({
                  resource: params.resource,
                  error: `Server returned error: ${response.error.message || 'Unknown error'}`
                });
                return;
              }

              // Handle successful response
              if (response.result && !hasResponded) {
                hasResponded = true;
                clearTimeout(timeout);
                server.kill();

                // Return result with resource type
                resolve({
                  resource: params.resource,
                  result: response.result
                });
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
        resolve({
          resource: params.resource,
          error: error.message || 'Unknown error'
        });
      }
    });

    server.on('exit', (code) => {
      if (!hasResponded) {
        hasResponded = true;
        clearTimeout(timeout);
        if (code !== 0) {
          resolve({
            resource: params.resource,
            error: `Server exited with code ${code}`
          });
        } else {
          resolve({
            resource: params.resource,
            result: null
          });
        }
      }
    });

    // Send request
    try {
      const toolName = TOOL_MAPPING[params.resource] || 'list_pods_by_ns';
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
        resolve({
          resource: params.resource,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });
}

// MCP task execution function (parallel)
async function runMcpTask(paramsList: CleanedParameters[]): Promise<Array<{resource: string, result?: any, error?: string}>> {
  console.error(`\n[Client] Executing ${paramsList.length} parallel queries`);

  const promises = paramsList.map(params => executeSingleMcpTask(params));

  try {
    const results = await Promise.all(promises);
    return results;
  } catch (error) {
    console.error('[Client] Error in parallel execution:', error);
    throw error;
  }
}

// Legacy single execution function (backward compatibility)
async function runMcpTaskLegacy(params: CleanedParameters): Promise<void> {
  const result = await executeSingleMcpTask(params);

  if (result.error) {
    throw new Error(result.error);
  }

  if (result.result) {
    displayResults(result.result);
  }
}

// Aggregated results display function for multi-resource queries
function displayAggregatedResults(results: Array<{resource: string, result?: any, error?: string}>) {
  // Define priority order for display
  const priority: Record<string, number> = { cluster: 1, node: 2, account: 3, debt: 4, devbox: 5, cronjob: 6, pods: 7, ingress: 8, event: 9, quota: 10 };

  // Sort results by priority
  const sortedResults = results.sort((a, b) => {
    const priorityA = priority[a.resource] || 999;
    const priorityB = priority[b.resource] || 999;
    return priorityA - priorityB;
  });

  console.log('\n' + '='.repeat(60));
  console.log('🔍 MULTI-RESOURCE QUERY RESULTS');
  console.log('='.repeat(60));

  let totalFound = 0;

  for (const { resource, result, error } of sortedResults) {
    if (error) {
      console.log(`\n❌ ${resource.toUpperCase()} Error: ${error}`);
      continue;
    }

    if (!result) {
      console.log(`\n📋 ${resource.toUpperCase()}: No data found`);
      continue;
    }

    // Use existing displayResults logic for each resource
    console.log(`\n` + '-'.repeat(40));
    console.log(`📊 ${resource.toUpperCase()} RESULTS`);
    console.log('-'.repeat(40));

    try {
      // Check for content array (MCP format)
      if (result && result.content && result.content.length > 0) {
        const textContent = result.content[0].text;
        const data = JSON.parse(textContent);

        // 1. Cluster List Rendering
        if (data.clusters && Array.isArray(data.clusters)) {
          console.log(`🗄️  Found ${data.total || data.clusters.length} clusters (databases) in namespace: ${data.namespace}`);

          const tableData = data.clusters.map((c: any) => ({
            Name: c.name,
            Type: c.type,
            Status: c.status,
            Version: c.version
          }));

          console.table(tableData);
          totalFound += data.clusters.length;
          continue;
        }

        // 2. Devbox List Rendering
        if (data.devboxes && Array.isArray(data.devboxes)) {
          console.log(`📦 Found ${data.total || data.devboxes.length} devboxes in namespace: ${data.namespace}`);

          const tableData = data.devboxes.map((d: any) => ({
            Name: d.name,
            Status: d.status,
            Network: JSON.stringify(d.network || {})
          }));

          console.table(tableData);
          totalFound += data.devboxes.length;
          continue;
        }

        // 3. Pod List Rendering
        if (data.pods && Array.isArray(data.pods)) {
          console.log(`🚀 Found ${data.total || data.pods.length} pods in namespace: ${data.namespace}`);

          const tableData = data.pods.map((p: any) => ({
            Name: p.name,
            Status: p.status,
            IP: p.ip,
            Node: p.node
          }));

          console.table(tableData);
          totalFound += data.pods.length;
          continue;
        }

        // 4. Quota List Rendering
        if (data.quotas && Array.isArray(data.quotas)) {
          console.log(`\n⚖️  Found ${data.total || data.quotas.length} resource quotas in namespace: ${data.namespace}`);

          // Iterate through each quota and display as transposed table
          data.quotas.forEach((q: any) => {
            console.log(`\n📌 Quota: ${q.name}`);

            // Parse details string: "cpu: 100m/1, memory: 1Gi/2Gi"
            const resources = q.details.split(', ').map((item: string) => {
              const [key, value] = item.split(': ');
              const [used, limit] = value ? value.split('/') : ['-', '-'];
              return {
                Resource: key,
                Used: used,
                Limit: limit
              };
            }).sort((a: any, b: any) => a.Resource.localeCompare(b.Resource));

            console.table(resources);
          });
          totalFound += data.quotas.length;
          continue;
        }

        // 5. Ingress List Rendering
        if (data.ingresses && Array.isArray(data.ingresses)) {
          displayIngressAsHybridRows(data.ingresses, data.namespace, data.total || data.ingresses.length);
          totalFound += data.ingresses.length;
          continue;
        }

        // 6. Node List Rendering
        if (data.nodes && Array.isArray(data.nodes)) {
          displayNodesAsHybridRows(data.nodes);
          totalFound += data.nodes.length;
          continue;
        }

        // 7. CronJob List Rendering
        if (data.cronjobs && Array.isArray(data.cronjobs)) {
          displayCronjobsAsHybridRows(data.cronjobs, data.namespace, data.total || data.cronjobs.length);
          totalFound += data.cronjobs.length;
          continue;
        }

        // 8. Event List Rendering
        if (data.events && Array.isArray(data.events)) {
          displayEventsAsTimeline(data.events, data.namespace);
          totalFound += data.events.length;
          continue;
        }

        // 9. Account List Rendering
        if (data.accounts && Array.isArray(data.accounts)) {
          displayAccountsAsNestedHybrid(data.accounts, data.namespace, data.total || data.accounts.length);
          totalFound += data.accounts.length;
          continue;
        }

        // 10. Debt List Rendering
        if (data.debts && Array.isArray(data.debts)) {
          displayDebtsAsNestedHybrid(data.debts, data.namespace, data.total || data.debts.length);
          totalFound += data.debts.length;
          continue;
        }

        // 11. Error Handling
        if (data.success === false) {
          console.error(`❌ Operation Failed: ${data.error?.message || data.error || 'Unknown error'}`);
          if (data.error?.details) {
            console.error('Details:', JSON.stringify(data.error.details, null, 2));
          }
          continue;
        }

        // 5. Fallback
        console.log('📝 Raw Result:');
        console.log(JSON.stringify(data, null, 2));
        continue;
      }

      // Legacy format support (result.data)
      if (result && result.data) {
        const { type, data } = result.data;

        switch (type) {
          case 'log':
            console.log('📋 Logs:');
            console.log(data.content || data);
            break;
          case 'event':
            console.log('⚡ Events:');
            console.table(data);
            break;
          case 'yaml':
            console.log('📄 YAML Configuration:');
            console.log('```yaml');
            console.log(data);
            console.log('```');
            break;
          case 'resource_info':
            console.log('💡 Resource Information:');
            console.log(data);
            break;
          case 'error':
            console.error('❌ Error:', data);
            break;
          default:
            console.log('📊 Result:');
            console.log(JSON.stringify(data, null, 2));
        }
        continue;
      }

      // Fallback for other formats
      console.error('No valid content in response');
      console.log('Raw response:', JSON.stringify(result, null, 2));

    } catch (parseError) {
      console.error(`❌ Failed to parse ${resource} result:`, parseError);
      console.log('Raw response:', JSON.stringify(result, null, 2));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log(`📋 SUMMARY: ${totalFound} total resources found across ${sortedResults.length} resource types`);
  console.log('='.repeat(60));
}

// Helper function for displaying Ingress resources in hybrid row format
function displayIngressAsHybridRows(ingresses: any[], namespace: string, total: number): void {
  console.log(`\n🌐 Found ${total || ingresses.length} ingresses in namespace: ${namespace}`);
  console.log('─'.repeat(60));

  ingresses.forEach((item: any, index: number) => {
    // Header line with index and metadata
    const nameStr = `[${index}] ${item.name}`;
    const metaStr = `(Class: ${item.ingressClass || item.class || '-'} | Address: ${item.address || '-'})`;
    console.log(`${nameStr.padEnd(30)} ${metaStr}`);

    // Body lines with tree structure
    const backend = item.backendService
      ? `${item.backendService}:${item.backendPort}`
      : (item.backend || '-');

    console.log(`    ├─ Hosts:   ${item.hosts || '-'}`);
    console.log(`    ├─ Paths:   ${item.paths || '-'}`);
    console.log(`    ├─ Backend: ${backend}`);
    console.log(`    └─ Ports:   ${item.ports || '-'}`);

    // Empty line for better spacing
    console.log('');
  });

  console.log('─'.repeat(60));
}

// Helper function for displaying Node resources in hybrid row format
function displayNodesAsHybridRows(nodes: any[]): void {
  console.log(`\n🖥️  Found ${nodes.length} cluster nodes`);
  console.log('─'.repeat(60));

  nodes.forEach((node: any, index: number) => {
    const nameStr = `[${index}] ${node.name}`;
    const metaStr = `(Roles: ${node.roles || 'worker'} | Status: ${node.status || 'Unknown'})`;
    console.log(`${nameStr.padEnd(30)} ${metaStr}`);

    console.log(`    ├─ IP:       ${node.ip || '-'}`);
    console.log(`    ├─ OS Image: ${node.osImage || '-'}`);
    console.log(`    └─ Age:      ${node.age || '-'}`);
    console.log('');
  });

  console.log('─'.repeat(60));
}

// Helper function for displaying CronJob resources in hybrid row format
function displayCronjobsAsHybridRows(cronjobs: any[], namespace: string, total: number): void {
  console.log(`\n⏰ Found ${total} cronjobs in namespace: ${namespace}`);
  console.log('─'.repeat(60));

  cronjobs.forEach((cronjob: any, index: number) => {
    const nameStr = `[${index}] ${cronjob.name}`;
    const metaStr = `(Schedule: ${cronjob.schedule || 'No schedule'} | Active: ${cronjob.active || 0})`;
    console.log(`${nameStr.padEnd(35)} ${metaStr}`);

    console.log(`    ├─ Suspend:       ${cronjob.suspend ? 'Yes' : 'No'}`);
    console.log(`    ├─ Last Schedule: ${cronjob.lastSchedule || 'Never'}`);
    console.log(`    └─ Age:          ${cronjob.age || '-'}`);
    console.log('');
  });

  console.log('─'.repeat(60));
}

// Helper function for displaying Events in compact timeline format
function displayEventsAsTimeline(events: any[], namespace: string): void {
  console.log(`\n🔔 Found ${events.length} events in namespace: ${namespace} (Showing last 100)`);
  console.log('─'.repeat(80));

  events.forEach((e: any) => {
    const timeStr = e.lastTimestamp ? new Date(e.lastTimestamp).toLocaleTimeString() : 'Unknown Time';
    const header = `[${timeStr}] ${e.type}/${e.reason} | ${e.object}`;

    const prefix = e.type === 'Warning' ? '⚠️ ' : '  ';

    console.log(`${prefix}${header}`);
    console.log(`     └─ ${e.message}`);
    console.log('');
  });

  console.log('─'.repeat(80));
}

// Helper function for displaying Account resources in nested hybrid format
function displayAccountsAsNestedHybrid(accounts: any[], namespace: string, total: number): void {
  console.log(`\n💰 Found ${total} accounts in namespace: ${namespace}`);
  console.log('─'.repeat(60));

  accounts.forEach((account: any, index: number) => {
    const nameStr = `[${index}] ${account.name}`;
    const status = account.status || {};
    const metaStr = `(Type: ${status.type || 'Unknown'} | Balance: ${status.balance || 'N/A'})`;
    console.log(`${nameStr.padEnd(35)} ${metaStr}`);

    console.log(`    ├─ Created: ${status.creationTime || '-'}`);

    // Display charge list if available
    if (status.chargeList && status.chargeList.length > 0) {
      console.log(`    └─ Charge List:`);
      status.chargeList.forEach((charge: any, idx: number) => {
        const isLast = idx === status.chargeList.length - 1;
        const prefix = isLast ? '      └─' : '      ├─';
        console.log(`${prefix} ${charge.type || 'Unknown'}: ${charge.amount || 0} ${charge.currency || ''}`);
      });
    } else {
      console.log(`    └─ Charge List: No charges`);
    }

    console.log('');
  });

  console.log('─'.repeat(60));
}

// Helper function for displaying Debt resources in nested hybrid format
function displayDebtsAsNestedHybrid(debts: any[], namespace: string, total: number): void {
  console.log(`\n💳 Found ${total} debts in namespace: ${namespace}`);
  console.log('─'.repeat(60));

  debts.forEach((debt: any, index: number) => {
    const nameStr = `[${index}] ${debt.name}`;
    const status = debt.status || {};
    const metaStr = `(Type: ${status.type || 'Unknown'} | Total: ${status.totalDebt || 0})`;
    console.log(`${nameStr.padEnd(35)} ${metaStr}`);

    // Display debt status records if available
    if (status.debtStatusRecords && status.debtStatusRecords.length > 0) {
      console.log(`    ├─ Debt Records:`);
      status.debtStatusRecords.forEach((record: any, idx: number) => {
        const isLast = idx === status.debtStatusRecords.length - 1;
        const prefix = isLast ? '      └─' : '      ├─';
        console.log(`${prefix} ${record.type || 'Unknown'}: ${record.amount || 0} (${record.status || 'Unknown'})`);
      });
    } else {
      console.log(`    └─ Debt Records: No records`);
    }

    console.log('');
  });

  console.log('─'.repeat(60));
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

      // 3. ✅ Quota List Rendering (Beautiful display)
      if (data.quotas && Array.isArray(data.quotas)) {
        console.log(`\n⚖️  Found ${data.total} resource quotas in namespace: ${data.namespace}`);

        // Iterate through each quota and display as transposed table
        data.quotas.forEach((q: any) => {
          console.log(`\n📌 Quota: ${q.name}`);

          // Parse details string: "cpu: 100m/1, memory: 1Gi/2Gi"
          const resources = q.details.split(', ').map((item: string) => {
            const [key, value] = item.split(': ');
            const [used, limit] = value ? value.split('/') : ['-', '-'];
            return {
              Resource: key,
              Used: used,
              Limit: limit
            };
          }).sort((a: any, b: any) => a.Resource.localeCompare(b.Resource));

          console.table(resources);
        });
        return; // Exit immediately after rendering, no JSON dump
      }

      // 4. ✅ Ingress List Rendering (Hybrid row display)
      if (data.ingresses && Array.isArray(data.ingresses)) {
        displayIngressAsHybridRows(data.ingresses, data.namespace, data.total || data.ingresses.length);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 5. ✅ Node List Rendering (Hybrid row display)
      if (data.nodes && Array.isArray(data.nodes)) {
        displayNodesAsHybridRows(data.nodes);
        return;
      }

      // 6. ✅ CronJob List Rendering (Hybrid row display)
      if (data.cronjobs && Array.isArray(data.cronjobs)) {
        displayCronjobsAsHybridRows(data.cronjobs, data.namespace, data.total || data.cronjobs.length);
        return;
      }

      // 7. ✅ Event List Rendering (Timeline display)
      if (data.events && Array.isArray(data.events)) {
        displayEventsAsTimeline(data.events, data.namespace);
        return;
      }

      // 8. ✅ Account List Rendering (Nested hybrid display)
      if (data.accounts && Array.isArray(data.accounts)) {
        displayAccountsAsNestedHybrid(data.accounts, data.namespace, data.total || data.accounts.length);
        return;
      }

      // 9. ✅ Debt List Rendering (Nested hybrid display)
      if (data.debts && Array.isArray(data.debts)) {
        displayDebtsAsNestedHybrid(data.debts, data.namespace, data.total || data.debts.length);
        return;
      }

      // 10. ❌ Error Handling
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