import { InspectViewModel } from '../viewmodels/inspect-viewmodel';

const COLORS = {
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m',
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

  const boxWidth = 70;
  const contentWidth = boxWidth - 4;

  // 1. Header
  console.log(drawBoxTop(boxWidth));
  
  const emoji = getResourceEmoji(viewModel.header.kind);
  const titleRaw = `${emoji} ${viewModel.header.kind.toUpperCase()}: ${viewModel.header.name}`;
  // Note: Emoji length calculation can be tricky, safePad protects us
  console.log(`│ ${COLORS.bold}${titleRaw}${COLORS.reset}${safePad(contentWidth, titleRaw.length - (emoji.length > 1 ? 1 : 0))} │`);

  const statusIndicator = getStatusIndicator(viewModel.header.statusColor);
  const statusParts = [
    `Status: ${statusIndicator} ${viewModel.header.status}`,
    `Namespace: ${viewModel.header.namespace}`,
    viewModel.header.age ? `Age: ${viewModel.header.age}` : null
  ].filter(Boolean);
  const statusLine = statusParts.join(' | ');
  // Calculate visible length stripping ANSI
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

  // 2. Configuration
  console.log(drawBoxMiddle(boxWidth));
  console.log(`│ ${COLORS.bold}Configuration:${COLORS.reset}${safePad(contentWidth, 14)} │`);
  
  if (viewModel.config.length > 0) {
    viewModel.config.slice(0, 15).forEach(item => {
      let line: string;
      if (item.key.startsWith('  └─')) {
        line = `   ${item.key}: ${item.value}`;
      } else {
        line = `• ${item.key}: ${item.value}`;
      }
      
      const wrapped = wrapText(line, contentWidth);
      wrapped.forEach((wLine, idx) => {
        const prefix = idx === 0 ? '' : '  '; // Indent wrapped lines
        const finalLine = prefix + wLine;
        console.log(`│ ${finalLine}${safePad(contentWidth, finalLine.length)} │`);
      });
    });
  } else {
    console.log(`│ ${COLORS.dim}  No configuration available${COLORS.reset}${safePad(contentWidth, 28)} │`);
  }

  // 3. Events Timeline
  console.log(drawBoxMiddle(boxWidth));
  console.log(`│ ${COLORS.bold}Events Timeline:${COLORS.reset}${safePad(contentWidth, 17)} │`);
  
  if (viewModel.events.length > 0) {
    viewModel.events.forEach(event => {
      const eventColor = event.type === 'Warning' ? COLORS.yellow : COLORS.green;
      // Format: [Time] Type: Reason -> Message
      const headerText = `${event.time} ${event.type}: ${event.reason}`;
      const headerLine = `${event.time} ${eventColor}${event.type}${COLORS.reset}: ${event.reason}`;
      
      console.log(`│ ${headerLine}${safePad(contentWidth, headerText.length)} │`);
      
      // Wrap message content
      const msgPrefix = '  └─ ';
      const wrappedMsg = wrapText(event.message, contentWidth - msgPrefix.length);
      
      wrappedMsg.forEach(line => {
        console.log(`│ ${COLORS.dim}${msgPrefix}${line}${COLORS.reset}${safePad(contentWidth, msgPrefix.length + line.length)} │`);
      });
      console.log(`│${safePad(contentWidth, 0)}  │`); // Spacer
    });
  } else {
    console.log(`│ ${COLORS.dim}  No recent events${COLORS.reset}${safePad(contentWidth, 19)} │`);
  }

  // 4. Logs
  if (viewModel.logs) {
    console.log(drawBoxMiddle(boxWidth));
    console.log(`│ ${COLORS.bold}Recent Logs (last 20 lines):${COLORS.reset}${safePad(contentWidth, 30)} │`);
    
    const logLines = viewModel.logs.split('\n').filter(line => line.trim());
    logLines.forEach(logLine => {
      // Strip ANSI from log content to be safe, then wrap
      const cleanLog = logLine.replace(/\x1b\[[0-9;]*m/g, '');
      const wrappedLogs = wrapText(cleanLog, contentWidth - 2);
      
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