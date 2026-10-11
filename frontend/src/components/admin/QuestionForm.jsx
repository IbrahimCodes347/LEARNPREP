import { useEffect, useRef, useState } from 'react';

const EMPTY = {
  subject: '',
  topic: '',
  difficulty: 'easy',
  questionText: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  marks: 1,
  explanation: ''
};

const QuestionForm = ({ open, onSubmit, submitting, initial }) => {
  const ref = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const [optionCount, setOptionCount] = useState(4);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      const next = { ...EMPTY, ...(initial ?? {}) };
      setForm(next);
      setOptionCount((next.options ?? []).length || 4);
    }
  }, [open, initial]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const setOption = (i, value) =>
    setForm((f) => {
      const options = [...f.options];
      options[i] = value;
      return { ...f, options };
    });

  const onFormSubmit = (e) => {
    e.preventDefault();
    // Drop trailing blank options so the server's min-length rule is satisfied.
    const options = form.options.map((o) => o.trim()).filter(Boolean);
    // Pick only schema fields: an edit form seeded from the list row also holds
    // _id / createdBy / __v / timestamps, which the strict schema rejects.
    onSubmit({
      subject: form.subject,
      topic: form.topic,
      difficulty: form.difficulty,
      questionText: form.questionText,
      options,
      correctIndex: Math.min(Number(form.correctIndex), options.length - 1),
      marks: Number(form.marks),
      explanation: form.explanation ?? ''
    });
  };

  return (
    <dialog ref={ref} className="modal">
      <div className="modal-box max-w-2xl">
        <h3 className="text-lg font-bold">{initial?._id ? 'Edit question' : 'Create question'}</h3>
        <form className="mt-3 flex flex-col gap-2" onSubmit={onFormSubmit}>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className="input input-bordered w-full" placeholder="Subject" value={form.subject} onChange={set('subject')} required />
            <input className="input input-bordered w-full" placeholder="Topic" value={form.topic} onChange={set('topic')} required />
            <select className="select select-bordered w-full" value={form.difficulty} onChange={set('difficulty')}>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
            </select>
          </div>

          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            placeholder="Question text"
            value={form.questionText}
            onChange={set('questionText')}
            required
          />

          {Array.from({ length: optionCount }, (_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-sm font-semibold">{String.fromCharCode(65 + i)})</span>
              <input
                className="input input-bordered w-full"
                placeholder={`Option ${String.fromCharCode(65 + i)}`}
                value={form.options[i] ?? ''}
                onChange={(e) => setOption(i, e.target.value)}
                required={i < 2}
              />
            </div>
          ))}

          {optionCount < 6 && (
            <button type="button" className="btn btn-ghost btn-xs w-fit" onClick={() => setOptionCount((c) => c + 1)}>
              + Add option
            </button>
          )}

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="fieldset">
              <span className="fieldset-legend">Correct option</span>
              <select
                className="select select-bordered w-full"
                value={form.correctIndex}
                onChange={set('correctIndex')}
              >
                {Array.from({ length: optionCount }, (_, i) => (
                  <option key={i} value={i}>
                    {String.fromCharCode(65 + i)}
                  </option>
                ))}
              </select>
            </label>
            <label className="fieldset">
              <span className="fieldset-legend">Marks</span>
              <input type="number" min={1} className="input input-bordered w-full" value={form.marks} onChange={set('marks')} />
            </label>
          </div>

          <textarea
            className="textarea textarea-bordered w-full"
            rows={2}
            placeholder="Explanation (shown only after submission)"
            value={form.explanation}
            onChange={set('explanation')}
          />

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Save question'}
            </button>
          </div>
        </form>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default QuestionForm;