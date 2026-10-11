import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { WrappedCategoryTick } from '../common/AnalyticsCharts';

/** `trend` is per-subject averages, not per-attempt, so this is a bar chart. */
const TrendChart = ({ data }) => {
  const rows = (data ?? []).map((d) => ({
    subject: d.subject ?? 'General',
    avgPercentage: Number(d.avgPercentage ?? 0),
    tests: Number(d.tests ?? 0)
  }));

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm opacity-60">No attempts yet.</p>;
  }

  return (
    <div style={{ width: '100%', height: Math.max(180, rows.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 32, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} vertical horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            allowDecimals={false}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'currentColor', fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="subject"
            width={150}
            tickLine={false}
            axisLine={false}
            tick={<WrappedCategoryTick />}
          />
          <Tooltip
            formatter={(v) => [`${Number(v).toFixed(2)}%`, 'Average']}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload;
              if (!row) return '';
              const t = Number(row.tests ?? 0);
              return t ? `${row.subject} (${t} test${t === 1 ? '' : 's'})` : row.subject;
            }}
          />
          <Bar dataKey="avgPercentage" fill="var(--color-primary)" minPointSize={3} radius={[0, 4, 4, 0]}>
            <LabelList dataKey="avgPercentage" position="right" formatter={(v) => `${Math.round(Number(v))}%`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TrendChart;