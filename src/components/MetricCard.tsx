import React, { useState } from "react";
import { HelpCircle } from "lucide-react";

interface MetricCardProps {
  title: string;
  primaryValue: string;
  unit: string;
  secondaryLabel: string;
  secondaryValue: string;
  dateRangeLabel: string;
  tooltipFormula: string;
  tooltipDetail: string;
  semanticTone?: "neutral" | "cyan" | "emerald" | "amber" | "rose";
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  primaryValue,
  unit,
  secondaryLabel,
  secondaryValue,
  dateRangeLabel,
  tooltipFormula,
  tooltipDetail,
  semanticTone = "neutral",
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const valueColorClass =
    semanticTone === "emerald"
      ? "text-emerald-300"
      : semanticTone === "cyan"
      ? "text-cyan-300"
      : semanticTone === "amber"
      ? "text-amber-300"
      : semanticTone === "rose"
      ? "text-rose-300"
      : "text-slate-100";

  return (
    <div className="bg-[#111726] border border-slate-800/90 rounded-md p-4 flex flex-col justify-between relative">
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-slate-400 leading-snug">
            {title}
          </span>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              aria-label={`Methodology details for ${title}`}
              className="text-slate-500 hover:text-slate-300 focus:outline-none p-0.5"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
            {showTooltip && (
              <div
                role="tooltip"
                className="absolute right-0 top-6 z-30 w-72 bg-[#0B0F17] border border-slate-700 rounded-md p-3 shadow-xl text-left"
              >
                <div className="text-[11px] font-mono text-cyan-300 mb-1">
                  {tooltipFormula}
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {tooltipDetail}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-baseline gap-1.5 font-mono tabular-nums">
          <span className={`text-2xl font-semibold tracking-tight ${valueColorClass}`}>
            {primaryValue}
          </span>
          <span className="text-xs font-medium text-slate-400">{unit}</span>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-400 font-mono tabular-nums">
        <span className="truncate">
          {secondaryLabel}: <strong className="text-slate-200 font-medium">{secondaryValue}</strong>
        </span>
        <span className="text-slate-500 shrink-0">{dateRangeLabel}</span>
      </div>
    </div>
  );
};
