interface AreaChartProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  showAxis?: boolean;
}

export default function AreaChart({
  data,
  width = 320,
  height = 80,
  color = "#22d3ee",
  showAxis = false,
}: AreaChartProps) {
  if (data.length < 2) return null;

  const padding = { top: 6, bottom: 6, left: 0, right: 0 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding.left + (i / (data.length - 1)) * chartW;
    const y = padding.top + chartH - ((v - min) / range) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${padding.left + chartW},${padding.top + chartH} L ${padding.left},${padding.top + chartH} Z`;
  const gradId = `area-${color.replace("#", "")}-${data.length}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {showAxis && (
        <>
          <line x1={0} y1={padding.top} x2={width} y2={padding.top} stroke="#334155" strokeWidth="0.5" opacity="0.3" />
          <line x1={0} y1={padding.top + chartH / 2} x2={width} y2={padding.top + chartH / 2} stroke="#334155" strokeWidth="0.5" opacity="0.2" strokeDasharray="2,2" />
          <line x1={0} y1={padding.top + chartH} x2={width} y2={padding.top + chartH} stroke="#334155" strokeWidth="0.5" opacity="0.3" />
        </>
      )}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
