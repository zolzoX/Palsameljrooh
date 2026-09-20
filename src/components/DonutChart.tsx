interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}

export default function DonutChart({ segments, size = 140, thickness = 16 }: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const fraction = seg.value / total;
    const dashLength = fraction * circumference;
    const arc = {
      key: i,
      color: seg.color,
      dashArray: `${dashLength} ${circumference - dashLength}`,
      dashOffset: -offset,
      label: seg.label,
      value: seg.value,
      pct: Math.round(fraction * 100),
    };
    offset += dashLength;
    return arc;
  });

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="flex-shrink-0">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={thickness}
        />
        {arcs.map((arc) => (
          <circle
            key={arc.key}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={arc.dashArray}
            strokeDashoffset={arc.dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: "stroke-dasharray 0.5s ease" }}
          />
        ))}
        <text
          x={center}
          y={center - 4}
          textAnchor="middle"
          className="fill-white text-lg font-bold"
          style={{ fontSize: "20px", fontWeight: 700 }}
        >
          {total}
        </text>
        <text
          x={center}
          y={center + 14}
          textAnchor="middle"
          className="fill-slate-500"
          style={{ fontSize: "10px" }}
        >
          Total
        </text>
      </svg>
      <div className="space-y-2">
        {arcs.map((arc) => (
          <div key={arc.key} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: arc.color }} />
            <span className="text-slate-300 font-medium">{arc.label}</span>
            <span className="text-slate-600">{arc.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
