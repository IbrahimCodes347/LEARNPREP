import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WrappedCategoryTick } from '../common/AnalyticsCharts';

/** `weakTopics` is [{ topic, count }], a count not an accuracy percentage. */
const WeakTopicsChart = ({ topics }) => {
  const rows = (topics ?? []).map((t) =>
    typeof t === 'string' ? { topic: t, count: 1 } : { topic: t?.topic ?? 'General', count: Number(t?.count ?? 0) }
  );

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm opacity-60">No weak topics - nice work.</p>;
  }

  return (
    <div className="flex w-full flex-col gap-1">
      <div style={{ width: '100%', height: Math.max(180, rows.length * 44) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical horizontal={false} />
            <XAxis
              type="number"
              allowDecimals={false}
              tickFormatter={(v) => String(Math.round(v))}
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'currentColor', fontSize: 12 }}
            />
            <YAxis
              type="category"
              dataKey="topic"
              width={150}
              tickLine={false}
              axisLine={false}
              tick={<WrappedCategoryTick />}
            />
            <Tooltip formatter={(v) => [String(v), 'Wrong answers']} />
            <Bar dataKey="count" fill="var(--color-error)" minPointSize={3} radius={[0, 4, 4, 0]}>
              <LabelList dataKey="count" position="right" formatter={(v) => String(v)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-xs opacity-60">Wrong answers</p>
    </div>
  );
};

export default WeakTopicsChart;