export function sortKeys(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeys);

  // Standard K8s resource order
  const priority = ['apiVersion', 'kind', 'metadata', 'spec', 'status'];

  const sorted: any = {};
  const keys = Object.keys(obj).sort((a, b) => {
    const idxA = priority.indexOf(a);
    const idxB = priority.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  keys.forEach(k => sorted[k] = sortKeys(obj[k]));
  return sorted;
}