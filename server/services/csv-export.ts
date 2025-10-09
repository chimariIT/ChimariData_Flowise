export function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  const res: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj || {})) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(res, flattenObject(value, newKey));
    } else {
      res[newKey] = Array.isArray(value) ? JSON.stringify(value) : value;
    }
  }
  return res;
}

export function jsonToCsv(input: any): string {
  // Normalize to array of rows
  const rows: Array<Record<string, any>> = Array.isArray(input)
    ? input
    : typeof input === 'object' && input
      ? [input]
      : [{ value: String(input) }];

  const flattened = rows.map((r) => flattenObject(r));
  const headers = Array.from(new Set(flattened.flatMap((r) => Object.keys(r))));

  const escape = (val: any) => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };

  const lines = [headers.join(',')];
  for (const row of flattened) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
