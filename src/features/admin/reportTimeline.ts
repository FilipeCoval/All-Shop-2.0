export type ReportTimelineRow = {
  date: Date;
  revenue: number;
  profit: number;
};

export type ReportTimelinePoint = {
  label: string;
  axisLabel: string;
  orders: number;
  revenue: number;
  profit: number;
};

const summarize = (rows: ReportTimelineRow[], label: string, axisLabel: string): ReportTimelinePoint => ({
  label,
  axisLabel,
  orders: rows.length,
  revenue: rows.reduce((sum, row) => sum + row.revenue, 0),
  profit: rows.reduce((sum, row) => sum + row.profit, 0),
});

/**
 * Produces the calendar scale used in the reports graph.
 * - complete history: one column per year
 * - selected year: all twelve months
 * - selected month: every calendar day, including days without orders
 */
export function buildReportTimeline(
  rows: ReportTimelineRow[],
  year: number | 'all',
  month: number | 'all',
  monthLabels: string[],
): ReportTimelinePoint[] {
  if (year === 'all') {
    const years = [...new Set(rows.map((row) => row.date.getFullYear()))].sort((a, b) => a - b);
    return years.map((item) => summarize(rows.filter((row) => row.date.getFullYear() === item), String(item), String(item)));
  }

  if (month === 'all') {
    return monthLabels.map((label, index) => summarize(
      rows.filter((row) => row.date.getMonth() === index),
      `${label} ${year}`,
      label,
    ));
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    return summarize(
      rows.filter((row) => row.date.getDate() === day),
      `${day} ${monthLabels[month]} ${year}`,
      String(day),
    );
  });
}
