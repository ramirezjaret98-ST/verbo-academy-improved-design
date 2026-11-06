/** Server-owned markers; these helpers only select display metrics. */
export function countsInRealMetrics(value: { is_sales_demo?: boolean }): boolean {
  return value.is_sales_demo !== true;
}
