import { Check, Circle, CircleDot } from 'lucide-react';

/** Icon + number + aria-label, never colour alone. Current cell gets aria-current. */
const QuestionPalette = ({ total, answers, currentIndex, onJump, footer }) => (
  <div className="card bg-base-100 shadow">
    <div className="card-body gap-3">
      <h3 className="font-semibold">Palette</h3>

      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: total }, (_, i) => {
          const answered = answers[i] !== null && answers[i] !== undefined;
          const isCurrent = i === currentIndex;
          const tone = isCurrent
            ? 'btn-primary'
            : answered
              ? 'btn-success'
              : 'btn-outline btn-error';
          const StateIcon = isCurrent ? CircleDot : answered ? Check : Circle;

          return (
            <button
              key={i}
              type="button"
              className={`btn btn-sm ${tone} btn-square`}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Q${i + 1} ${answered ? 'answered' : 'not answered'}${isCurrent ? ', current' : ''}`}
              onClick={() => onJump(i)}
            >
              <StateIcon size={12} aria-hidden="true" />
              <span aria-hidden="true">{i + 1}</span>
            </button>
          );
        })}
      </div>

      <ul className="mt-1 space-y-1 text-xs opacity-80">
        <li className="flex items-center gap-1.5">
          <Check size={12} className="shrink-0" aria-hidden="true" />
          answered
        </li>
        <li className="flex items-center gap-1.5">
          <Circle size={12} className="shrink-0" aria-hidden="true" />
          not answered
        </li>
        <li className="flex items-center gap-1.5">
          <CircleDot size={12} className="shrink-0" aria-hidden="true" />
          current
        </li>
      </ul>

      {footer}
    </div>
  </div>
);

export default QuestionPalette;
