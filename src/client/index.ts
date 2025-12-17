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
import * as Renderer from './renderers';
import { transformToViewModel } from './viewmodels/inspect-viewmodel';
import { renderInspectView } from './renderers/inspect-renderer';
import { sortKeys } from './utils/sort-keys';

// === [NEW] Global Context Management (Refined) ===
interface GlobalParameters {
  zone: string | null;
  namespace: string | null;
  resource: string | null;
  name: string | null;
}

// 1. Initialize Context (Strict Null)
let parameters: GlobalParameters = { zone: null, namespace: null, resource: null, name: null };

// 2. Constants
const KNOWN_ZONES = new Set(['hzh', 'bja', 'gzg']);
// Command keywords to ignore when parsing 'name'
const IGNORED_KEYWORDS = new Set(['describe', 'inspect', 'get', 'list', 'show', 'watch', 'debug']);
const KNOWN_RESOURCES = new Set([
  'cluster', 'node', 'account', 'debt', 'devbox',
  'objectstorage', 'obs', 'bucket', 'certificate', 'cert',
  'cronjob', 'pods', 'pod', 'ingress', 'event', 'quota'
]);

/**
 * Updates global parameters and returns true if Scope (Zone/NS) changed.
 */
function updateParameters(inputString: string): boolean {
  const tokens = inputString.trim().split(/\s+/);
  let [newZone, newNs, newResource, newName] = [null, null, null, null] as (string | null)[];
  let lastResourceIndex = -1;

  // First pass: identify zones, namespaces, resources, and their positions
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const lower = token.toLowerCase();

    if (!lower || lower === '!' || IGNORED_KEYWORDS.has(lower)) continue;

    if (KNOWN_ZONES.has(lower)) {
      newZone = lower;
    } else if (lower.startsWith('ns-')) {
      newNs = lower;
    } else if (KNOWN_RESOURCES.has(lower)) {
      newResource = lower;
      lastResourceIndex = i; // Track position of the last resource token
    }
  }

  // Second pass: identify potential names (only tokens immediately after a resource)
  if (lastResourceIndex !== -1 && lastResourceIndex + 1 < tokens.length) {
    const potentialName = tokens[lastResourceIndex + 1];
    const lowerName = potentialName.toLowerCase();

    // Allow hyphenated names - only exclude if it's a zone, namespace, or ignored keyword
    if (potentialName &&
        !KNOWN_ZONES.has(lowerName) &&
        !lowerName.startsWith('ns-') &&
        !IGNORED_KEYWORDS.has(lowerName)) {
      newName = potentialName;
    }
  }

  // 1. Scope Change Detection
  // Change detected if: New value provided AND (Current is null OR New != Current)
  const isZoneChanged = newZone !== null && newZone !== parameters.zone;
  const isNsChanged = newNs !== null && newNs !== parameters.namespace;

  const isScopeChanged = isZoneChanged || isNsChanged;

  if (isScopeChanged) {
    console.log('[Context] Scope change detected. Resetting context.');
    parameters = { zone: null, namespace: null, resource: null, name: null };
  }

  // 2. Merge new values (Update provided fields)
  if (newZone) parameters.zone = newZone;
  if (newNs) parameters.namespace = newNs;
  if (newResource) parameters.resource = newResource;
  if (newName) parameters.name = newName;

  if (newZone || newNs || newResource || newName) {
    console.log('[Context Updated]', JSON.stringify(parameters));
  }

  return isScopeChanged;
}
// ==================================

// Global variables for process tracking
let activeMcpServers = new Set<ChildProcess>();
let mainReadlineInterface: readline.Interface | null = null;
let lastSigintTime = 0;
let lastToolResult: any = null; // Global AI context memory

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

    // Parse flags before AI processing
    const isRawMode = input.includes('--raw');

    // Parse --lines flag
    const linesMatch = input.match(/--lines(?:\s+(\d+))?/);
    let linesCount: number | undefined;
    if (linesMatch) {
      const linesValue = parseInt(linesMatch[1] || '30');
      if (linesValue > 0) {
        linesCount = linesValue;
      } else {
        console.error('⚠️  Invalid value for --lines. Must be a positive integer. Using default: 30');
        linesCount = 30;
      }
    }

    // Strip flags from input
    const cleanInput = input
      .replace(/--raw/g, '')
      .replace(/--lines(?:\s+\d+)?/g, '')
      .trim();

    try {
      // 1. Update Context & Check Scope Change
      const isScopeChanged = updateParameters(cleanInput);

      // 2. Manage AI History
      if (isScopeChanged) {
         // If scope changed, previous tool outputs are likely irrelevant
         lastToolResult = null;
      }

      // 3. Call AI (Existing Logic)
      const rawArgs = cleanInput.split(/\s+/);
      console.error('[AI] Processing input...');
      const cleanedParamsList = await aiService.parseRawInput(rawArgs, lastToolResult);

      if (!cleanedParamsList || cleanedParamsList.length === 0) {
        console.error('❌ Invalid input. Please provide at least: [namespace, resource, identifier] OR [resource, identifier] for nodes');
        console.error('   Examples: ns-mh69tey1 pods hzh');
        console.error('             node hzh');
        rl.prompt();
        return;
      }

      // === [NEW] Parameter Fusion Logic ===
      // Use for..of instead of forEach to allow early return on errors
      for (const item of cleanedParamsList) {
        // A. Namespace Fusion (Always merge)
        if (!item.namespace && parameters.namespace) {
          item.namespace = parameters.namespace;
          console.log(`[Fusion] Auto-filled namespace: ${parameters.namespace}`);
        }

        // B. Intent-specific Logic
        if (item.intent === 'list') {
          // Rule: Clear name cache on List
          if (parameters.name) {
            parameters.name = null;
            console.log('[Fusion] List intent: Cleared cached name.');
          }
          // Rule: Force zone as identifier if missing or is a known zone
          const isMissingOrZone = !item.identifier || KNOWN_ZONES.has(item.identifier.toLowerCase());
          if (isMissingOrZone && parameters.zone) {
            item.identifier = parameters.zone;
            console.log(`[Fusion] List intent: Auto-filled zone: ${parameters.zone}`);
          }
        } else if (item.intent === 'inspect') {
          // Rule: DO NOT auto-fill name from cache - describe/inspect MUST have explicit name
          // If identifier is missing or generic, show immediate error and abort
          const isMissingOrZone = !item.identifier || KNOWN_ZONES.has(item.identifier.toLowerCase());
          if (isMissingOrZone) {
            console.error('[Fusion] ERROR: Inspect intent requires explicit name/identifier');
            console.error('   Usage: describe <resource> <name>');
            console.error('   Example: describe devbox my-app');
            rl.prompt(); // Return to prompt immediately
            return; // Abort execution - exits the try block entirely
          }
        }
      }
      // ======================================

      // Add lines parameter to cleaned params if present
      if (linesCount && cleanedParamsList.length > 0) {
        cleanedParamsList.forEach(params => {
          params.lines = linesCount;
        });
      }

      // Execute MCP tasks (parallel or single based on array length)
      if (cleanedParamsList.length === 1) {
        // Single resource - use legacy function for backward compatibility
        const resultRaw = await runMcpTaskLegacy(cleanedParamsList[0], isRawMode);
        // 构造一致的上下文格式
        lastToolResult = [{
          resource: cleanedParamsList[0].resource,
          data: tryParseJson(resultRaw.result?.content?.[0]?.text),
          error: resultRaw.error
        }];
      } else {
        // Multiple resources - use parallel execution
        console.error(`[Client] Querying ${cleanedParamsList.length} resource types in parallel...`);
        const results = await runMcpTask(cleanedParamsList);

        // 保存上下文，仅保留必要字段
        lastToolResult = results.map(r => ({
          resource: r.resource,
          // 尝试解析 JSON 字符串，如果解析失败则保留原文本
          data: tryParseJson(r.result?.content?.[0]?.text),
          error: r.error
        }));

        displayAggregatedResults(results, isRawMode);
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
  'objectstorage': 'list_objectstoragebucket_by_ns',
  'obs': 'list_objectstoragebucket_by_ns',
  'bucket': 'list_objectstoragebucket_by_ns',
  'certificate': 'list_certificate_by_ns',
  'cert': 'list_certificate_by_ns',
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
      let toolName;
      let requestArgs;

      if (params.intent === 'inspect') {
        // Force use inspect_resource tool
        toolName = 'inspect_resource';
        requestArgs = {
          namespace: params.namespace,
          resource: params.resource, // Server supports both singular and plural
          name: params.identifier,   // Actual resource name for inspect
          ...(params.lines && { lines: params.lines }) // Add lines parameter if present
        };
      } else {
        // Use existing TOOL_MAPPING logic for list
        toolName = TOOL_MAPPING[params.resource] || 'list_pods_by_ns';
        requestArgs = {
          namespace: params.namespace
        };
      }

      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: requestArgs
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
async function runMcpTaskLegacy(params: CleanedParameters, isRawMode: boolean = false): Promise<any> {
  const result = await executeSingleMcpTask(params);

  if (result.error) {
    throw new Error(result.error);
  }

  if (result.result) {
    displayResults(result.result, isRawMode);
  }

  return result;
}

// Aggregated results display function for multi-resource queries
function displayAggregatedResults(results: Array<{resource: string, result?: any, error?: string}>, isRawMode: boolean = false) {
  // Define priority order for display
  const priority: Record<string, number> = { cluster: 1, node: 2, account: 3, debt: 4, devbox: 5, objectstorage: 6, certificate: 7, cronjob: 8, pods: 9, ingress: 10, event: 11, quota: 12 };

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

        // Check for inspect_resource response first
        if (data.manifest || (data.events && Array.isArray(data.events))) {
          console.log(`\n🔍 Inspect Result for ${resource}:`);
          if (isRawMode) {
            console.log(JSON.stringify(sortKeys(data), null, 2));
          } else {
            console.log(JSON.stringify(data, null, 2));
          }
          totalFound += 1; // Count as one item
          continue;
        }

        // 1. Cluster List Rendering
        if (data.clusters && Array.isArray(data.clusters)) {
          Renderer.displayClustersAsTable(data.clusters, data.namespace, data.total || data.clusters.length);
          totalFound += data.clusters.length;
          continue;
        }

        // 2. Devbox List Rendering
        if (data.devboxes && Array.isArray(data.devboxes)) {
          Renderer.displayDevboxesAsTable(data.devboxes, data.namespace, data.total || data.devboxes.length);
          totalFound += data.devboxes.length;
          continue;
        }

        // 3. Pod List Rendering
        if (data.pods && Array.isArray(data.pods)) {
          Renderer.displayPodsAsTable(data.pods, data.namespace, data.total || data.pods.length);
          totalFound += data.pods.length;
          continue;
        }

        // 4. Quota List Rendering
        if (data.quotas && Array.isArray(data.quotas)) {
          Renderer.displayQuotasAsTransposedTable(data.quotas, data.namespace, data.total || data.quotas.length);
          totalFound += data.quotas.length;
          continue;
        }

        // 5. Ingress List Rendering
        if (data.ingresses && Array.isArray(data.ingresses)) {
          Renderer.displayIngressAsHybridRows(data.ingresses, data.namespace, data.total || data.ingresses.length);
          totalFound += data.ingresses.length;
          continue;
        }

        // 6. Node List Rendering
        if (data.nodes && Array.isArray(data.nodes)) {
          Renderer.displayNodesAsHybridRows(data.nodes);
          totalFound += data.nodes.length;
          continue;
        }

        // 7. CronJob List Rendering
        if (data.cronjobs && Array.isArray(data.cronjobs)) {
          Renderer.displayCronjobsAsHybridRows(data.cronjobs, data.namespace, data.total || data.cronjobs.length);
          totalFound += data.cronjobs.length;
          continue;
        }

        // 8. Event List Rendering
        if (data.events && Array.isArray(data.events)) {
          Renderer.displayEventsAsTimeline(data.events, data.namespace);
          totalFound += data.events.length;
          continue;
        }

        // 9. Account List Rendering
        if (data.accounts && Array.isArray(data.accounts)) {
          Renderer.displayAccountsAsNestedHybrid(data.accounts, data.namespace, data.total || data.accounts.length);
          totalFound += data.accounts.length;
          continue;
        }

        // 10. Debt List Rendering
        if (data.debts && Array.isArray(data.debts)) {
          Renderer.displayDebtsAsNestedHybrid(data.debts, data.namespace, data.total || data.debts.length);
          totalFound += data.debts.length;
          continue;
        }

        // 11. ObjectStorageBucket List Rendering
        if (data.objectstoragebuckets && Array.isArray(data.objectstoragebuckets)) {
          Renderer.displayObjectStorageBucketsAsTable(data.objectstoragebuckets, data.namespace, data.total || data.objectstoragebuckets.length);
          totalFound += data.objectstoragebuckets.length;
          continue;
        }

        // 12. Certificate List Rendering
        if (data.certificates && Array.isArray(data.certificates)) {
          Renderer.displayCertificatesAsTable(data.certificates, data.namespace, data.total || data.certificates.length);
          totalFound += data.certificates.length;
          continue;
        }

        // 13. Error Handling
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


// Result display function (reuse existing logic)
function displayResults(result: any, isRawMode: boolean = false) {
  // Check for content array (MCP format)
  if (result && result.content && result.content.length > 0) {
    const textContent = result.content[0].text;
    try {
      const data = JSON.parse(textContent);

      // Check for inspect_resource response first
      if (data.manifest || (data.events && Array.isArray(data.events))) {
        if (isRawMode) {
          console.log(JSON.stringify(sortKeys(data), null, 2));
        } else {
          const viewModel = transformToViewModel(data);
          if (viewModel) {
            renderInspectView(viewModel);
          } else {
            console.error('Failed to transform inspect data to view model');
            console.log('\n🔍 Raw Inspect Result:');
            console.log(JSON.stringify(data, null, 2));
          }
        }
        return; // Exit early for inspect results
      }

      // 1. ✅ Cluster List Rendering
      if (data.clusters && Array.isArray(data.clusters)) {
        Renderer.displayClustersAsTable(data.clusters, data.namespace, data.total);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 2. ✅ Devbox List Rendering
      if (data.devboxes && Array.isArray(data.devboxes)) {
        Renderer.displayDevboxesAsTable(data.devboxes, data.namespace, data.total);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 3. ✅ Pod List Rendering (Beautiful display)
      if (data.pods && Array.isArray(data.pods)) {
        Renderer.displayPodsAsTable(data.pods, data.namespace, data.total);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 4. ✅ Quota List Rendering (Beautiful display)
      if (data.quotas && Array.isArray(data.quotas)) {
        Renderer.displayQuotasAsTransposedTable(data.quotas, data.namespace, data.total);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 5. ✅ Ingress List Rendering (Hybrid row display)
      if (data.ingresses && Array.isArray(data.ingresses)) {
        Renderer.displayIngressAsHybridRows(data.ingresses, data.namespace, data.total || data.ingresses.length);
        return; // Exit immediately after rendering, no JSON dump
      }

      // 6. ✅ Node List Rendering (Hybrid row display)
      if (data.nodes && Array.isArray(data.nodes)) {
        Renderer.displayNodesAsHybridRows(data.nodes);
        return;
      }

      // 7. ✅ CronJob List Rendering (Hybrid row display)
      if (data.cronjobs && Array.isArray(data.cronjobs)) {
        Renderer.displayCronjobsAsHybridRows(data.cronjobs, data.namespace, data.total || data.cronjobs.length);
        return;
      }

      // 8. ✅ Event List Rendering (Timeline display)
      if (data.events && Array.isArray(data.events)) {
        Renderer.displayEventsAsTimeline(data.events, data.namespace);
        return;
      }

      // 9. ✅ Account List Rendering (Nested hybrid display)
      if (data.accounts && Array.isArray(data.accounts)) {
        Renderer.displayAccountsAsNestedHybrid(data.accounts, data.namespace, data.total || data.accounts.length);
        return;
      }

      // 10. ✅ Debt List Rendering (Nested hybrid display)
      if (data.debts && Array.isArray(data.debts)) {
        Renderer.displayDebtsAsNestedHybrid(data.debts, data.namespace, data.total || data.debts.length);
        return;
      }

      // 11. ✅ ObjectStorageBucket List Rendering
      if (data.objectstoragebuckets && Array.isArray(data.objectstoragebuckets)) {
        Renderer.displayObjectStorageBucketsAsTable(data.objectstoragebuckets, data.namespace, data.total || data.objectstoragebuckets.length);
        return;
      }

      // 12. ✅ Certificate List Rendering
      if (data.certificates && Array.isArray(data.certificates)) {
        Renderer.displayCertificatesAsTable(data.certificates, data.namespace, data.total || data.certificates.length);
        return;
      }

      // 13. ❌ Error Handling
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

// Helper function for JSON parsing with fallback
function tryParseJson(input: any): any {
  if (typeof input !== 'string') return input;
  try { return JSON.parse(input); } catch { return input; }
}

// Start the program
main().catch(error => {
  console.error('[Client] Fatal error:', error);
  process.exit(1);
});