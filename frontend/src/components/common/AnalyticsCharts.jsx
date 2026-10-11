/* eslint-disable react-refresh/only-export-components -- chart renderers + colour hook live together */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';

const tooltipStyle = {
  background: 'var(--color-base-100)',
  border: '1px solid var(--color-base-300)',
  borderRadius: 8
};

/**
 * Recharts needs a colour value, not a class, so the daisyUI tokens are read off
 * the document. `useTheme` keeps the value correct after a theme switch: the
 * provider re-renders this component, unlike a bare getComputedStyle read.
 */
export const useChartColors = () => {
  // Subscribing to the theme (value unused) is what re-reads the tokens on a switch.
  useTheme();
  const read = (name, fallback) => {
    if (typeof window === 'undefined') return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  };
  return {
    correct: read('--color-success', 'currentColor'),
    wrong: read('--color-error', 'currentColor'),
    skipped: read('--color-base-300', 'currentColor'),
    primary: read('--color-primary', 'currentColor'),
    grid: read('--color-base-300', 'currentColor')
  };
};

const truncate = (text, max = 28) => {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
};

const CHARS_PER_LINE = 16;

/** Wraps a category name onto up to two lines at ~16 chars each. */
function wrapWords(value, max = CHARS_PER_LINE) {
  const text = String(value ?? '');
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines = [];
  let line = '';
  const push = (word) => {
    if (word === '') return;
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  };
  for (const word of words) {
    let rest = word;
    while (rest.length > max) {
      push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    push(rest);
  }
  if (line) lines.push(line);
  if (lines.length > 2) return [lines[0], `${lines[1]}...`];
  return lines;
}

/** Category-axis tick: real text on two lines, never rotated, theme coloured. */
export const WrappedCategoryTick = ({ x, y, payload }) => {
  const lines = wrapWords(payload.value);
  return (
    <text
      x={x}
      y={y}
      dy={4}
      textAnchor="end"
      fill="currentColor"
      fontSize={11}
      className="recharts-category-tick"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 11}>
          {line}
        </tspan>
      ))}
    </text>
  );
};

/** data: [{ name, value, color }]. Every slice carries its name so it is never colour-only. */
export const DonutChart = ({ data, height = 260 }) => (
  <div style={{ width: '100%', height }}>
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="50%"
          outerRadius="78%"
          paddingAngle={2}
          label={({ name, value }) => (value ? `${name} ${value}` : '')}
        >
          {data.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  </div>
);

/**
 * data: [{ <xKey>, <barKey>, color? }]. Set `layout="vertical"` for horizontal
 * bars. A per-row `color` highlights a single bar (the correct option).
 */
export const BarChartCard = ({
  data,
  xKey,
  barKey,
  height,
  color,
  layout = 'horizontal',
  domain,
  valueFormatter,
  tickFormatter,
  showValues = true,
  labelPosition,
  labelFill
}) => {
  const { grid } = useChartColors();
  const cells = data.some((row) => row.color);
  // One row per category (44 px per row); keep a floor so a single item is not a sliver.
  const chartHeight = height ?? Math.max(180, data.length * 44);

  return (
    <div style={{ width: '100%', height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: layout === 'vertical' ? 32 : 16, bottom: 8, left: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={grid}
            vertical={layout === 'vertical'}
            horizontal={layout === 'horizontal'}
          />
          {layout === 'vertical' ? (
            <>
              <XAxis
                type="number"
                domain={domain}
                tickFormatter={tickFormatter}
                tick={{ fill: 'currentColor', fontSize: 12 }}
              />
              <YAxis type="category" dataKey={xKey} width={150} tick={<WrappedCategoryTick />} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fill: 'currentColor', fontSize: 12 }} />
              <YAxis
                domain={domain}
                tickFormatter={tickFormatter}
                tick={{ fill: 'currentColor', fontSize: 12 }}
              />
            </>
          )}
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={valueFormatter}
            labelFormatter={(value, payload) => payload?.[0]?.payload?.tooltipLabel ?? value}
          />
          <Bar
            dataKey={barKey}
            fill={color}
            minPointSize={layout === 'vertical' ? 3 : 0}
            radius={layout === 'vertical' ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          >
            {cells && data.map((row, i) => <Cell key={i} fill={row.color ?? color} />)}
            {showValues && (
              <LabelList
                dataKey={barKey}
                position={labelPosition ?? (layout === 'vertical' ? 'right' : 'top')}
                formatter={valueFormatter}
                fill={labelFill}
              />
            )}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Line of score % per attempt (indexed #1, #2, ...). When a pass mark exists it
 * is drawn as a dotted reference line. Every point is labelled with its value.
 */
export const ScoreTrendChart = ({ data, passPercentage = null, height = 240 }) => {
  const { primary, grid, correct } = useChartColors();
  const points = (data ?? []).map((p, i) => ({ ...p, attempt: i + 1 }));
  const hasPass = passPercentage !== null && passPercentage !== undefined;

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} />
          <XAxis dataKey="attempt" tickFormatter={(v) => `#${v}`} />
          <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(v) => `Attempt ${v}`}
            formatter={(v) => `${v}%`}
          />
          {hasPass && (
            <ReferenceLine
              y={passPercentage}
              stroke={primary}
              strokeDasharray="4 4"
              label={{ value: `Pass ${passPercentage}%`, position: 'insideTopRight', fill: primary }}
            />
          )}
          <Line type="monotone" dataKey="percentage" stroke={primary} strokeWidth={2} dot={{ r: 3, fill: correct }}>
            <LabelList dataKey="percentage" position="top" formatter={(v) => `${v}%`} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

/**
 * Stacked vertical bars of counts (e.g. passed vs failed per grade).
 * series: [{ key, name, color }]. Values are whole numbers.
 */
export const StackedBarCard = ({ data, xKey, series, height = 260, showValues = true }) => {
  const { grid } = useChartColors();
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={grid} />
          <XAxis dataKey={xKey} tick={{ fill: 'currentColor', fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fill: 'currentColor', fontSize: 12 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} stackId="counts" fill={s.color} radius={[0, 0, 0, 0]}>
              {showValues && (
                <LabelList
                  dataKey={s.key}
                  position="inside"
                  formatter={(v) => (v && v > 0 ? v : '')}
                  fill="var(--color-base-100)"
                />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export { truncate };
