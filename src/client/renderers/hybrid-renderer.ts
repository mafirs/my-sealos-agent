// Hybrid row layout renderers for displaying Kubernetes resources

// Helper function for displaying Ingress resources in hybrid row format
export function displayIngressAsHybridRows(ingresses: any[], namespace: string, total: number): void {
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
export function displayNodesAsHybridRows(nodes: any[]): void {
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
export function displayCronjobsAsHybridRows(cronjobs: any[], namespace: string, total: number): void {
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

// Helper function for displaying Account resources in nested hybrid format
export function displayAccountsAsNestedHybrid(accounts: any[], namespace: string, total: number): void {
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
export function displayDebtsAsNestedHybrid(debts: any[], namespace: string, total: number): void {
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