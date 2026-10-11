import { OPTION_LABELS } from '../../lib/utils';

/** Never receives correctIndex or explanation: the API withholds them until submit. */
const QuestionCard = ({ question, index, total, selectedIndex, onSelect, disabled }) => (
  <section className="card bg-base-100 shadow">
    <div className="card-body gap-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          Q{index + 1} <span className="opacity-60">of {total}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="badge badge-neutral">{question.subject}</span>
          <span className="badge badge-ghost">{question.topic}</span>
          <span className="badge badge-outline">
            {question.marks === 1 ? '1 mark' : `${question.marks} marks`}
          </span>
        </div>
      </header>

      <p className="text-base leading-relaxed">{question.questionText}</p>

      <div role="radiogroup" aria-label={`Options for question ${index + 1}`} className="flex flex-col gap-2">
        {(question.options ?? []).map((opt, i) => {
          const isSelected = selectedIndex === i;
          return (
            <label
              key={i}
              className={`btn btn-lg h-auto w-full justify-start whitespace-normal text-left font-normal ${
                isSelected ? 'btn-primary' : 'btn-outline'
              }`}
            >
              <input
                type="radio"
                className="radio radio-sm"
                name={`q-${question._id}`}
                checked={isSelected}
                disabled={disabled}
                onChange={() => onSelect(i)}
                value={i}
              />
              <span className="font-semibold">{OPTION_LABELS[i] ?? i + 1})</span>
              <span className="flex-1">{opt}</span>
            </label>
          );
        })}
      </div>
    </div>
  </section>
);

export default QuestionCard;