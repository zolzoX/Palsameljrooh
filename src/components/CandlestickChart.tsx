interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

interface CandlestickChartProps {
  data: Candle[];
  width?: number;
  height?: number;
  color?: string;
}

export default function CandlestickChart({
  data,
  width = 320,
  height = 120,
  color = "#22d3ee",
}: CandlestickChartProps) {
  if (data.length < 2) return null;

  const padding = { top: 8, bottom: 4, left: 0, right: 0 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const allHighs = data.map((d) => d.high);
  const allLows = data.map((d) => d.low);
  const max = Math.max(...allHighs);
  const min = Math.min(...allLows);
  const range = max - min || 1;

  const candleWidth = Math.max(2, chartW / data.length - 1);
  const gap = chartW / data.length;

  const y = (val: number) => padding.top + chartH - ((val - min) / range) * chartH;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      {data.map((c, i) => {
        const x = padding.left + i * gap + gap / 2;
        const isUp = c.close >= c.open;
        const cColor = isUp ? "#22c55e" : "#ef4444";
        const bodyTop = y(Math.max(c.open, c.close));
        const bodyBottom = y(Math.min(c.open, c.close));
        const bodyH = Math.max(1, bodyBottom - bodyTop);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} stroke={cColor} strokeWidth="1" opacity="0.8" />
            <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyH} fill={cColor} opacity="0.9" rx="0.5" />
          </g>
        );
      })}
      <line x1={0} x2={width} y1={padding.top} y2={padding.top} stroke={color} strokeWidth="0.5" opacity="0.2" />
    </svg>
  );
}
