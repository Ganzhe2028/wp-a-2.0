const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  // 中和电子表格公式前缀（= + - @ 制表符 回车），防止公式注入
  const neutralized = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (
    neutralized.includes(",") ||
    neutralized.includes('"') ||
    neutralized.includes("\n") ||
    neutralized.includes("\r")
  ) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function csvRow(values: string[]): string {
  return values.map(csvCell).join(",");
}
