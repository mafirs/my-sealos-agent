import { InspectViewModel, DetailedContainer } from '../viewmodels/inspect-viewmodel';

const COLORS = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', blue: '\x1b[34m', gray: '\x1b[90m',
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', cyan: '\x1b[36m'
};

const RESOURCE_EMOJIS: Record<string, string> = {
  'Pod': '📦', 'Devbox': '🎮', 'Cluster': '🗄️', 'Error': '❌'
};

// Helper: Render a section title
function renderSectionTitle(title: string) {
  console.log(`\n${COLORS.bold}${COLORS.cyan}${title}${COLORS.reset}`);
  console.log(COLORS.gray + '─'.repeat(title.length) + COLORS.reset);
}

// Helper: Render Key-Value pairs nicely
function renderKV(key: string, value: string, indent: number = 2) {
  const pad = ' '.repeat(indent);
  console.log(`${pad}${COLORS.dim}${key}:${COLORS.reset} ${value}`);
}

// Helper: Render Container Details
function renderContainer(c: DetailedContainer) {
  const statusColor = c.state.includes('Running') ? COLORS.green : c.state.includes('Terminated') ? COLORS.red : COLORS.yellow;
  console.log(`  ${COLORS.bold}${c.name}${COLORS.reset} [${statusColor}${c.state}${COLORS.reset}]`);

  renderKV('Image', `${c.image} (ID: ${c.imageID})`, 4);
  renderKV('Restarts', String(c.restartCount), 4);

  if (c.command) renderKV('Command', c.command.join(' '), 4);
  if (c.args) renderKV('Args', c.args.join(' '), 4);
  if (c.ports.length) renderKV('Ports', c.ports.join(', '), 4);
  if (c.resources.length) renderKV('Resources', c.resources.join(', '), 4);

  if (c.env.length > 0) {
    console.log(`    ${COLORS.dim}Environment:${COLORS.reset}`);
    c.env.forEach(e => console.log(`      • ${e}`));
  }

  if (c.mounts.length > 0) {
    console.log(`    ${COLORS.dim}Mounts:${COLORS.reset}`);
    c.mounts.forEach(m => console.log(`      • ${m}`));
  }
  console.log('');
}

// Helper to get resource emoji
function getResourceEmoji(kind: string): string {
  return RESOURCE_EMOJIS[kind] || '📄';
}

// Helper to draw a box line
function drawLine(length: number = 90): string {
  return '─'.repeat(length);
}
function drawBoxTop(length: number = 90): string {
  return `┌${drawLine(length - 2)}┐`;
}
function drawBoxBottom(length: number = 90): string {
  return `└${drawLine(length - 2)}┘`;
}

// Helper for safe padding
function safePad(contentWidth: number, textLength: number): string {
  return ' '.repeat(Math.max(0, contentWidth - textLength));
}

export function renderInspectView(viewModel: InspectViewModel): void {
  console.log('\n');

  // --- 1. HEADER (BOXED) ---
  const boxWidth = 90;
  const contentWidth = boxWidth - 4;
  console.log(drawBoxTop(boxWidth));

  const emoji = getResourceEmoji(viewModel.header.kind);
  const titleRaw = `${emoji} ${viewModel.header.kind.toUpperCase()}: ${viewModel.header.name}`;
  console.log(`│ ${COLORS.bold}${titleRaw}${COLORS.reset}${safePad(contentWidth, titleRaw.length - (emoji.length > 1 ? 1 : 0))} │`);

  const statusColor = COLORS[viewModel.header.statusColor];
  const statusIndicator = `${statusColor}●${COLORS.reset}`;
  const line2 = `Status: ${statusIndicator} ${viewModel.header.status}  |  NS: ${viewModel.header.namespace}  |  Age: ${viewModel.header.age}`;
  // Approx ansi length calculation
  console.log(`│ ${line2}${safePad(contentWidth, line2.replace(/\x1b\[[0-9;]*m/g, '').length)} │`);

  const line3 = `Node: ${viewModel.header.node}  |  IP: ${viewModel.header.ip}  |  QoS: ${viewModel.header.qosClass || '-'}`;
  console.log(`│ ${line3}${safePad(contentWidth, line3.replace(/\x1b\[[0-9;]*m/g, '').length)} │`);

  if (viewModel.header.controlledBy) {
    const line4 = `Controlled By: ${viewModel.header.controlledBy}`;
    console.log(`│ ${line4}${safePad(contentWidth, line4.length)} │`);
  }
  console.log(drawBoxBottom(boxWidth));

  // --- 2. METADATA ---
  if (viewModel.metadata.labels.length > 0 || viewModel.metadata.annotations.length > 0) {
    renderSectionTitle('Metadata');
    if (viewModel.metadata.labels.length > 0) {
      console.log(`  ${COLORS.bold}Labels:${COLORS.reset}`);
      viewModel.metadata.labels.forEach(l => console.log(`    ${l}`));
    }
    if (viewModel.metadata.annotations.length > 0) {
      console.log(`  ${COLORS.bold}Annotations:${COLORS.reset}`);
      viewModel.metadata.annotations.forEach(a => console.log(`    ${a}`));
    }
  }

  // --- 3. CONDITIONS ---
  if (viewModel.conditions && viewModel.conditions.length > 0) {
    renderSectionTitle('Conditions');
    // Simple table layout
    console.log(`  ${COLORS.dim}${'TYPE'.padEnd(25)} ${'STATUS'.padEnd(10)} ${'LAST TRANSITION'.padEnd(25)} ${'REASON'}${COLORS.reset}`);
    viewModel.conditions.forEach(c => {
       const statusColor = c.status === 'True' ? COLORS.green : COLORS.red;
       console.log(`  ${c.type.padEnd(25)} ${statusColor}${c.status.padEnd(10)}${COLORS.reset} ${c.lastTransitionTime.padEnd(25)} ${c.reason}`);
       if (c.message && c.message !== '-') {
         console.log(`    └─ ${COLORS.dim}${c.message}${COLORS.reset}`);
       }
    });
  }

  // --- 4. CONTAINERS ---
  if (viewModel.containers.length > 0) {
    renderSectionTitle('Containers');
    viewModel.containers.forEach(renderContainer);
  }

  if (viewModel.initContainers && viewModel.initContainers.length > 0) {
    renderSectionTitle('Init Containers');
    viewModel.initContainers.forEach(renderContainer);
  }

  // --- 5. VOLUMES & NODE INFO ---
  if (viewModel.volumes && viewModel.volumes.length > 0) {
    renderSectionTitle('Volumes');
    viewModel.volumes.forEach(v => console.log(`  • ${v}`));
  }

  if (viewModel.nodeInfo) {
    if (viewModel.nodeInfo.selectors.length > 0 || viewModel.nodeInfo.tolerations.length > 0) {
      renderSectionTitle('Node Scheduling');
      if (viewModel.nodeInfo.selectors.length > 0) {
        console.log(`  ${COLORS.bold}Selectors:${COLORS.reset}`);
        viewModel.nodeInfo.selectors.forEach(s => console.log(`    ${s}`));
      }
      if (viewModel.nodeInfo.tolerations.length > 0) {
        console.log(`  ${COLORS.bold}Tolerations:${COLORS.reset}`);
        viewModel.nodeInfo.tolerations.forEach(t => console.log(`    ${t}`));
      }
    }
  }

  // --- 6. EVENTS ---
  if (viewModel.events.length > 0) {
    renderSectionTitle('Events');
    console.log(`  ${COLORS.dim}${'TIME'.padEnd(10)} ${'TYPE'.padEnd(10)} ${'REASON'.padEnd(20)} ${'MESSAGE'}${COLORS.reset}`);
    viewModel.events.forEach(e => {
      const typeColor = e.type === 'Warning' ? COLORS.yellow : COLORS.green;
      console.log(`  ${e.time.padEnd(10)} ${typeColor}${e.type.padEnd(10)}${COLORS.reset} ${e.reason.padEnd(20)} ${e.message}`);
    });
  }

  // --- 7. LOGS ---
  if (viewModel.logs) {
    renderSectionTitle('Recent Logs (Last 30 lines)');
    console.log(COLORS.dim);
    console.log(viewModel.logs); // Simply print the logs, no boxing, let terminal handle wrapping
    console.log(COLORS.reset);
  }

  // Warnings
  if (viewModel.warnings && viewModel.warnings.length > 0) {
    console.log(`\n${COLORS.yellow}⚠️  Warnings:${COLORS.reset}`);
    viewModel.warnings.forEach(w => console.log(`   ${w}`));
  }

  console.log('\n');
}