// Table layout renderers for displaying tabular Kubernetes resources

// Cluster table rendering function
export function displayClustersAsTable(clusters: any[], namespace: string, total: number): void {
  console.log(`🗄️  Found ${total || clusters.length} clusters (databases) in namespace: ${namespace}`);

  const tableData = clusters.map((c: any) => ({
    Name: c.name,
    Type: c.type,
    Status: c.status,
    Version: c.version
  }));

  console.table(tableData);
}

// Devbox table rendering function
export function displayDevboxesAsTable(devboxes: any[], namespace: string, total: number): void {
  console.log(`📦 Found ${total || devboxes.length} devboxes in namespace: ${namespace}`);

  const tableData = devboxes.map((d: any) => ({
    Name: d.name,
    Status: d.status,
    Network: JSON.stringify(d.network || {})
  }));

  console.table(tableData);
}

// Pods table rendering function
export function displayPodsAsTable(pods: any[], namespace: string, total: number): void {
  console.log(`🚀 Found ${total || pods.length} pods in namespace: ${namespace}`);

  const tableData = pods.map((p: any) => ({
    Name: p.name,
    Status: p.status,
    IP: p.ip,
    Node: p.node
  }));

  console.table(tableData);
}

// Quotas transposed table rendering function
export function displayQuotasAsTransposedTable(quotas: any[], namespace: string, total: number): void {
  console.log(`\n⚖️  Found ${total || quotas.length} resource quotas in namespace: ${namespace}`);

  // Iterate through each quota and display as transposed table
  quotas.forEach((q: any) => {
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
}