import { CutoffMode, AlignmentMode, IntervalAnalysisRow } from "../types/analytics";

const intFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

const oneDecFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const twoDecFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMw(val: number | null | undefined, decimals: 0 | 1 = 0): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return decimals === 1 ? oneDecFormatter.format(val) : intFormatter.format(Math.round(val));
}

export function formatSignedMw(val: number | null | undefined, decimals: 0 | 1 = 0): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  const prefix = val > 0 ? "+" : "";
  const formatted =
    decimals === 1 ? oneDecFormatter.format(val) : intFormatter.format(Math.round(val));
  return `${prefix}${formatted}`;
}

export function formatMwh(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return intFormatter.format(Math.round(val));
}

export function formatGwh(mwh: number | null | undefined): string {
  if (mwh === null || mwh === undefined || Number.isNaN(mwh)) return "—";
  return twoDecFormatter.format(mwh / 1000);
}

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return "—";
  return `${twoDecFormatter.format(val)}%`;
}

export function formatCutoffLabel(mode: CutoffMode): string {
  switch (mode) {
    case "d_minus_1_1100":
      return "D-1 11:00 GMT (GB Day-Ahead Auction)";
    case "d_minus_1_1200":
      return "D-1 12:00 GMT (Midday Forecast Run)";
    case "d_minus_1_1830":
      return "D-1 18:30 GMT (Evening EFA Block)";
    case "lead_time_12h":
      return "Rolling >= 12h Lead Horizon";
    case "lead_time_4h":
      return "Rolling >= 4h Lead Horizon";
  }
}

export function formatAlignmentLabel(mode: AlignmentMode): string {
  return mode === "strict_exact"
    ? "Strict Exact startTime Match (Hourly 60m)"
    : "Half-Hourly Settlement Step-Hold (30m SP1–SP48)";
}

export function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  const [, m, d] = dateStr.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIdx = Math.max(0, Math.min(11, Number(m) - 1));
  return `${d} ${months[mIdx]}`;
}

export function exportIntervalsToCsv(
  rows: IntervalAnalysisRow[],
  filename = "windsight_jan2026_intervals.csv"
): void {
  const headers = [
    "Delivery_Date_London",
    "Delivery_Time_London",
    "Settlement_Period",
    "Start_Time_UTC",
    "Actual_Generation_MW",
    "Selected_Forecast_MW",
    "Actual_Energy_MWh",
    "Forecast_Energy_MWh",
    "Signed_Error_MW (Forecast-Actual)",
    "Absolute_Error_MW",
    "Percentage_Error_Pct",
    "Forecast_Publish_Time_UTC",
    "Forecast_Publish_Time_London",
    "Decision_Cutoff_UTC",
    "Lead_Time_Hours",
    "Availability_Status",
    "Eligible_Vintages",
    "Total_Vintages",
  ];

  const csvLines = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.deliveryDate,
        r.deliveryTimeLondon,
        r.settlementPeriod,
        r.startTime,
        r.actualMw ?? "",
        r.forecastMw ?? "",
        r.actualMwh ?? "",
        r.forecastMwh ?? "",
        r.signedErrorMw ?? "",
        r.absErrorMw ?? "",
        r.pctError ?? "",
        r.publishTime ?? "",
        r.publishTimeLondon ?? "",
        r.cutoffTimeUtc,
        r.leadTimeHours ?? "",
        r.status,
        r.vintageCountEligible,
        r.vintageCountTotal,
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ];

  const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
