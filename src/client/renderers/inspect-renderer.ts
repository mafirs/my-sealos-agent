import { InspectViewModel } from '../viewmodels/inspect-viewmodel';

const COLORS = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m', blue: '\x1b[34m',
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m'
};

const RESOURCE_EMOJIS: Record<string, string> = {
  'Pod': '📦', 'Devbox': '🎮', 'Cluster': '🗄️', 'Error': '❌'
};

function getStatusIndicator(color: 'green' | 'red' | 'yellow' | 'gray'): string {
  const colorCode = COLORS[color];
  return `${colorCode}●${COLORS.reset}`;
}

function getResourceEmoji(kind: string): string {
  return RESOURCE_EMOJIS[kind] || '📄';
}

function drawLine(length: number = 70): string { return '─'.repeat(length); }
function drawBoxTop(length: number = 70): string { return `┌${drawLine(length - 2)}┐`; }
function drawBoxMiddle(length: number = 70): string { return `├${drawLine(length - 2)}┤`; }
function drawBoxBottom(length: number = 70): string { return `└${drawLine(length - 2)}┘`; }

// Safe padding helper to prevent crash
function safePad(contentWidth: number, textLength: number): string {
  return ' '.repeat(Math.max(0, contentWidth - textLength));
}

// New helper functions for enhanced display

// Draw a formatted table
function drawTable(headers: string[], rows: string[][], columnWidths: number[], boxWidth: number): void {
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + (columnWidths.length - 1) * 3;
  const leftPadding = Math.floor((boxWidth - 4 - totalWidth) / 2);

  // Header row
  const headerLine = ' '.repeat(leftPadding) + headers.map((header, i) =>
    header.padEnd(columnWidths[i])
  ).join(' │ ');
  console.log(`│ ${headerLine}${safePad(boxWidth - 4, headerLine.length)} │`);

  // Separator line
  const separatorLine = ' '.repeat(leftPadding) + columnWidths.map(width => '─'.repeat(width)).join('───');
  console.log(`│ ${separatorLine}${safePad(boxWidth - 4, separatorLine.length)} │`);

  // Data rows
  rows.forEach(row => {
    const dataLine = ' '.repeat(leftPadding) + row.map((cell, i) => {
      // Truncate if too long
      const maxLength = columnWidths[i] - 1;
      const truncated = cell.length > maxLength ? cell.substring(0, maxLength) + '…' : cell;
      return truncated.padEnd(columnWidths[i]);
    }).join(' │ ');
    console.log(`│ ${dataLine}${safePad(boxWidth - 4, dataLine.length)} │`);
  });
}

// Draw a colored tag
function drawTag(label: string, color: string = COLORS.blue): string {
  return `${color}[${label}]${COLORS.reset}`;
}

// Format condition status with symbol and color
function formatConditionStatus(status: string): string {
  return status === 'True' ? `${COLORS.green}✓${COLORS.reset}` :
         status === 'False' ? `${COLORS.red}✗${COLORS.reset}` :
         `${COLORS.yellow}?${COLORS.reset}`;
}

// Sort conditions by importance
function sortConditions(conditions: any[]): any[] {
  const priority: Record<string, number> = {
    'Ready': 1,
    'ContainersReady': 2,
    'Initialized': 3,
    'Scheduled': 4,
    'PodScheduled': 5
  };

  return conditions.sort((a: any, b: any) => {
    const aPriority = priority[a.type] || 999;
    const bPriority = priority[b.type] || 999;
    return aPriority - bPriority;
  });
}


// Robust text wrapper that handles long words
function wrapText(text: string, maxWidth: number): string[] {
  if (!text) return [''];
  // Strip ANSI codes for length calculation
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');
  
  if (stripAnsi(text).length <= maxWidth) return [text];

  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    // If a single word is too long, force split it
    if (stripAnsi(word).length > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = '';
      
      let remaining = word;
      while (stripAnsi(remaining).length > 0) {
        if (stripAnsi(remaining).length > maxWidth) {
          lines.push(remaining.slice(0, maxWidth));
          remaining = remaining.slice(maxWidth);
        } else {
          currentLine = remaining;
          remaining = '';
        }
      }
      continue;
    }

    if (stripAnsi(currentLine + (currentLine ? ' ' : '') + word).length <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function renderInspectView(viewModel: InspectViewModel): void {
  console.log('\n');

  // Error View
  if (viewModel.error) {
    console.log(`${COLORS.red}${COLORS.bold}❌ Error:${COLORS.reset}`);
    console.log(`${viewModel.error.message}`);
    if (viewModel.error.reason) console.log(`${COLORS.dim}Reason: ${viewModel.error.reason}${COLORS.reset}`);
    console.log('');
    return;
  }

  const boxWidth = 90; // Increased width for better table display
  const contentWidth = boxWidth - 4;

  // 1. Header (Keep existing)
  console.log(drawBoxTop(boxWidth));

  const emoji = getResourceEmoji(viewModel.header.kind);
  const titleRaw = `${emoji} ${viewModel.header.kind.toUpperCase()}: ${viewModel.header.name}`;
  console.log(`│ ${COLORS.bold}${titleRaw}${COLORS.reset}${safePad(contentWidth, titleRaw.length - (emoji.length > 1 ? 1 : 0))} │`);

  const statusIndicator = getStatusIndicator(viewModel.header.statusColor);
  const statusParts = [
    `Status: ${statusIndicator} ${viewModel.header.status}`,
    `Namespace: ${viewModel.header.namespace}`,
    viewModel.header.age ? `Age: ${viewModel.header.age}` : null
  ].filter(Boolean);
  const statusLine = statusParts.join(' | ');
  const statusVisibleLen = statusLine.replace(/\x1b\[[0-9;]*m/g, '').length;
  console.log(`│ ${statusLine}${safePad(contentWidth, statusVisibleLen)} │`);

  if (viewModel.header.node || viewModel.header.ip) {
    const nodeParts = [
      viewModel.header.node ? `Node: ${viewModel.header.node}` : null,
      viewModel.header.ip ? `IP: ${viewModel.header.ip}` : null
    ].filter(Boolean);
    if (nodeParts.length > 0) {
      const nodeLine = nodeParts.join(' | ');
      console.log(`│ ${nodeLine}${safePad(contentWidth, nodeLine.length)} │`);
    }
  }

  // 2. Metadata Section (NEW)
  const hasMetadata = (viewModel.metadata.labels && viewModel.metadata.labels.length > 0) ||
                     (viewModel.metadata.annotations && viewModel.metadata.annotations.length > 0) ||
                     (viewModel.metadata.ownerReferences && viewModel.metadata.ownerReferences.length > 0);

  if (hasMetadata) {
    console.log(drawBoxMiddle(boxWidth));
    console.log(`│ ${COLORS.bold}Metadata:${COLORS.reset}${safePad(contentWidth, 10)} │`);

    // Labels as tags
    if (viewModel.metadata.labels && viewModel.metadata.labels.length > 0) {
      const labelTags = viewModel.metadata.labels.slice(0, 8).map(label => drawTag(label, COLORS.blue)).join(' ');
      const labelLine = `Labels: ${labelTags}`;
      const wrappedLabels = wrapText(labelLine, contentWidth - 2);
      wrappedLabels.forEach(line => {
        console.log(`│ ${line}${safePad(contentWidth, line.length)} │`);
      });
      if (viewModel.metadata.labels.length > 8) {
        console.log(`│ ${COLORS.dim}... and ${viewModel.metadata.labels.length - 8} more labels${COLORS.reset}${safePad(contentWidth, 30)} │`);
      }
    }

    // Owner references
    if (viewModel.metadata.ownerReferences && viewModel.metadata.ownerReferences.length > 0) {
      console.log(`│ ${COLORS.dim}Owner: ${viewModel.metadata.ownerReferences[0]}${COLORS.reset}${safePad(contentWidth, 8 + viewModel.metadata.ownerReferences[0].length)} │`);
    }
  }

  // 3. Conditions Section (NEW Table View)
  if (viewModel.conditions && viewModel.conditions.length > 0) {
    console.log(drawBoxMiddle(boxWidth));
    console.log(`│ ${COLORS.bold}Conditions:${COLORS.reset}${safePad(contentWidth, 12)} │`);

    const sortedConditions = sortConditions(viewModel.conditions);
    const tableHeaders = ['TYPE', 'STATUS', 'REASON', 'LAST TRANSITION'];
    const columnWidths = [15, 8, 15, 20];

    const tableRows = sortedConditions.map(condition => [
      condition.type,
      formatConditionStatus(condition.status),
      condition.reason || '-',
      condition.lastTransitionTime || '-'
    ]);

    drawTable(tableHeaders, tableRows, columnWidths, boxWidth);
  }

  // 4. Containers Section (Enhanced Tree View)
  if (viewModel.containers && viewModel.containers.length > 0) {
    console.log(drawBoxMiddle(boxWidth));
    console.log(`│ ${COLORS.bold}Containers:${COLORS.reset}${safePad(contentWidth, 12)} │`);

    viewModel.containers.forEach((container, index) => {
      const isLast = index === viewModel.containers!.length - 1;

      // Container state color
      const stateColor = container.state.includes('Running') ? COLORS.green :
                        container.state.includes('Waiting') ? COLORS.yellow :
                        container.state.includes('Terminated') || container.state.includes('Error') ? COLORS.red :
                        COLORS.gray;

      // Container header with image
      const containerHeader = `${container.name} (${container.image})`;
      const statusIcon = container.ready ? `${COLORS.green}✓${COLORS.reset}` : `${COLORS.red}✗${COLORS.reset}`;
      const headerLine = `  ${isLast ? '└─' : '├─'} 📦 ${containerHeader} ${statusIcon} ${stateColor}${container.state}${COLORS.reset}`;

      console.log(`│ ${headerLine}${safePad(contentWidth, headerLine.length)} │`);

      // Container details
      const details = [
        `Restarts: ${container.restartCount}`,
        `Ready: ${container.ready ? 'Yes' : 'No'}`
      ];

      if (container.ports && container.ports.length > 0) {
        details.push(`Ports: ${container.ports.slice(0, 3).join(', ')}${container.ports.length > 3 ? '...' : ''}`);
      }

      details.forEach((detail) => {
        const prefix = '      ├─';
        const detailLine = `${prefix} ${detail}`;
        console.log(`│ ${detailLine}${safePad(contentWidth, detailLine.length)} │`);
      });

      // Environment variables
      if (container.env && container.env.length > 0) {
        const envPrefix = isLast ? '      └─' : '      ├─';
        console.log(`│ ${envPrefix} Environment Variables:${safePad(contentWidth, 25)} │`);
        container.env.slice(0, 3).forEach((envVar, envIndex) => {
          const isEnvLast = envIndex === Math.min(2, container.env!.length - 1) && container.env!.length <= 3;
          const envPrefix2 = isLast && isEnvLast && isLast ? '         └─' : '         ├─';
          const envLine = `${envPrefix2} ${envVar}`;
          console.log(`│ ${envLine}${safePad(contentWidth, envLine.length)} │`);
        });
        if (container.env.length > 3) {
          console.log(`│ ${COLORS.dim}            ... and ${container.env.length - 3} more${COLORS.reset}${safePad(contentWidth, 30)} │`);
        }
      }

      // Volume mounts
      if (container.mounts && container.mounts.length > 0) {
        const mountPrefix = isLast ? '      └─' : '      ├─';
        console.log(`│ ${mountPrefix} Volume Mounts:${safePad(contentWidth, 18)} │`);
        container.mounts.slice(0, 3).forEach((mount, mountIndex) => {
          const isMountLast = mountIndex === Math.min(2, container.mounts!.length - 1) && container.mounts!.length <= 3;
          const mountPrefix2 = isLast && isMountLast && isLast ? '         └─' : '         ├─';
          const mountLine = `${mountPrefix2} ${mount}`;
          console.log(`│ ${mountLine}${safePad(contentWidth, mountLine.length)} │`);
        });
        if (container.mounts.length > 3) {
          console.log(`│ ${COLORS.dim}            ... and ${container.mounts.length - 3} more${COLORS.reset}${safePad(contentWidth, 30)} │`);
        }
      }

      // Resources
      if (container.resources && container.resources.length > 0) {
        const resourcePrefix = isLast ? '      └─' : '      ├─';
        console.log(`│ ${resourcePrefix} Resources:${safePad(contentWidth, 14)} │`);
        container.resources.forEach((resource, resourceIndex) => {
          const isResourceLast = resourceIndex === container.resources!.length - 1;
          const resourcePrefix2 = isLast && isResourceLast && isLast ? '         └─' : '         ├─';
          const resourceLine = `${resourcePrefix2} ${resource}`;
          console.log(`│ ${resourceLine}${safePad(contentWidth, resourceLine.length)} │`);
        });
      }
    });
  }

  // 5. Configuration (for non-Pod resources)
  if (viewModel.config && viewModel.config.length > 0) {
    console.log(drawBoxMiddle(boxWidth));
    console.log(`│ ${COLORS.bold}Configuration:${COLORS.reset}${safePad(contentWidth, 14)} │`);

    viewModel.config.slice(0, 10).forEach(item => {
      const line = `• ${item.key}: ${item.value}`;
      const wrapped = wrapText(line, contentWidth - 2);
      wrapped.forEach((wLine, idx) => {
        const prefix = idx === 0 ? '' : '  ';
        const finalLine = prefix + wLine;
        console.log(`│ ${finalLine}${safePad(contentWidth, finalLine.length)} │`);
      });
    });
  }

  // 6. Events Timeline (Enhanced with icons)
  console.log(drawBoxMiddle(boxWidth));
  console.log(`│ ${COLORS.bold}Events Timeline:${COLORS.reset}${safePad(contentWidth, 17)} │`);

  if (viewModel.events.length > 0) {
    viewModel.events.slice(0, 10).forEach((event, index) => {
      const isLast = index === Math.min(9, viewModel.events.length - 1);
      const eventIcon = event.type === 'Warning' ? '⚠' : '●';
      const eventColor = event.type === 'Warning' ? COLORS.yellow : COLORS.green;

      const prefix = isLast ? '└─' : '├─';
      const headerLine = `  ${prefix} ${event.time} ${eventIcon} ${eventColor}${event.type}${COLORS.reset}: ${event.reason}`;

      console.log(`│ ${headerLine}${safePad(contentWidth, headerLine.length)} │`);

      // Wrap message content
      if (event.message && event.message !== '-') {
        const wrappedMsg = wrapText(event.message, contentWidth - 14);

        wrappedMsg.forEach((line, msgIndex) => {
          const isMsgLast = msgIndex === wrappedMsg.length - 1;
          const msgPrefix2 = isLast && isMsgLast ? '           └─' : '           ├─';
          console.log(`│ ${msgPrefix2} ${COLORS.dim}${line}${COLORS.reset}${safePad(contentWidth, 15 + line.length)} │`);
        });
      }
    });
  } else {
    console.log(`│ ${COLORS.dim}  No recent events${COLORS.reset}${safePad(contentWidth, 19)} │`);
  }

  // 7. Logs
  if (viewModel.logs) {
    console.log(drawBoxMiddle(boxWidth));
    console.log(`│ ${COLORS.bold}Recent Logs (last 20 lines):${COLORS.reset}${safePad(contentWidth, 30)} │`);

    const logLines = viewModel.logs.split('\n').filter(line => line.trim());
    logLines.slice(0, 15).forEach(logLine => {
      const cleanLog = logLine.replace(/\x1b\[[0-9;]*m/g, '');
      const wrappedLogs = wrapText(cleanLog, contentWidth - 4);

      wrappedLogs.forEach(wLine => {
        console.log(`│ ${COLORS.dim}  ${wLine}${COLORS.reset}${safePad(contentWidth, wLine.length + 2)} │`);
      });
    });
  }

  console.log(drawBoxBottom(boxWidth));

  if (viewModel.warnings && viewModel.warnings.length > 0) {
    console.log(`\n${COLORS.yellow}⚠️  Warnings:${COLORS.reset}`);
    viewModel.warnings.forEach(warning => console.log(`   ${warning}`));
  }
  console.log('\n');
}