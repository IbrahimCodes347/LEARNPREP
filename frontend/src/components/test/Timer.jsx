import { Timer as TimerIcon } from 'lucide-react';
import { formatTime } from '../../lib/utils';

/** mm:ss is always visible, colour only adds urgency on top (a11y). */
const Timer = ({ remainingSec, isWarning, isError }) => {
  const tone = isError ? 'text-error' : isWarning ? 'text-warning' : '';
  const mm = Math.floor((remainingSec ?? 0) / 60);
  const ss = (remainingSec ?? 0) % 60;

  return (
    <span className={`inline-flex items-center gap-2 font-semibold ${tone}`}>
      <TimerIcon size={16} aria-hidden="true" />
      <span className="font-mono text-lg tabular-nums" role="timer" aria-label={`${formatTime(remainingSec)} remaining`}>
        {formatTime(remainingSec)}
      </span>
      <span className="sr-only">
        {mm} minutes and {ss} seconds remaining
      </span>
    </span>
  );
};

export default Timer;