// Timeline layout renderers for displaying time-based Kubernetes resources

// Helper function for displaying Events in compact timeline format
export function displayEventsAsTimeline(events: any[], namespace: string): void {
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