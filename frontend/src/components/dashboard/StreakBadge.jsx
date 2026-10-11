import { Flame } from 'lucide-react';

const StreakBadge = ({ count = 0 }) => (
  <span className={`badge gap-1 ${count > 0 ? 'badge-warning' : 'badge-ghost'}`} title={`${count} day streak`}>
    <Flame size={14} aria-hidden="true" />
    <span className="font-semibold">{count}</span>
    <span className="sr-only">day streak</span>
  </span>
);

export default StreakBadge;
