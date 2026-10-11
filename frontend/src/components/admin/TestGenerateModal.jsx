import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { admin } from '../../api/endpoints';

const EMPTY = {
  title: '',
  subject: '',
  topics: [],
  difficulties: [],
  count: 10,
  durationMinutes: 30,
  negativeMarks: 0,
  passMarks: '',
  shuffle: true,
  status: 'draft',
  activeFrom: '',
  activeUntil: '',
  maxTabSwitches: 3,
  maxAttempts: 1
};

const DIFFICULTIES = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' }
];

/** Generates a test from the bank. Filters come from real bank data; the
 * exact server error text is surfaced as-is when a real shortage occurs. */
const TestGenerateModal = ({ open, onSubmit, submitting, onClose }) => {
  const ref = useRef(null);
  const [form, setForm] = useState(EMPTY);

  const { data } = useQuery({
    queryKey: ['admin', 'questions', 'bank'],
    queryFn: admin.bankBreakdown,
    enabled: open
  });

  const subjects = data?.subjects ?? [];
  const subjectData = subjects.find((s) => s.subject === form.subject);

  const available = useMemo(() => {
    if (!subjectData) return 0;
    const topicRows = form.topics.length
      ? subjectData.topics.filter((t) => form.topics.includes(t.topic))
      : subjectData.topics;
    const diffs = form.difficulties.length ? form.difficulties : ['easy', 'medium', 'hard'];
    return topicRows.reduce(
      (sum, t) => sum + diffs.reduce((acc, d) => acc + (t.difficulties[d] ?? 0), 0),
      0
    );
  }, [subjectData, form.topics, form.difficulties]);

  const requested = Number(form.count) || 0;
  const notEnough = requested < 1 || available < requested;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (open) setForm(EMPTY);
  }, [open]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const pickSubject = (value) => setForm((f) => ({ ...f, subject: value, topics: [] }));

  const toggleTopic = (topic) =>
    setForm((f) => ({
      ...f,
      topics: f.topics.includes(topic) ? f.topics.filter((t) => t !== topic) : [...f.topics, topic]
    }));

  const toggleDifficulty = (d) =>
    setForm((f) => ({
      ...f,
      difficulties: f.difficulties.includes(d)
        ? f.difficulties.filter((x) => x !== d)
        : [...f.difficulties, d]
    }));

  const onFormSubmit = (e) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      subject: form.subject,
      count: Number(form.count),
      durationMinutes: Number(form.durationMinutes),
      negativeMarks: Number(form.negativeMarks) || 0,
      shuffle: form.shuffle,
      status: form.status,
      maxTabSwitches: Number(form.maxTabSwitches) || 0,
      maxAttempts: Number(form.maxAttempts) || 0
    };
    if (form.passMarks !== '') payload.passMarks = Number(form.passMarks);
    if (form.activeFrom) payload.activeFrom = new Date(form.activeFrom).toISOString();
    if (form.activeUntil) payload.activeUntil = new Date(form.activeUntil).toISOString();
    if (form.topics.length) payload.topics = form.topics;
    if (form.difficulties.length) payload.difficulties = form.difficulties;
    onSubmit(payload);
  };

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box max-w-2xl">
        <h3 className="text-lg font-bold">Generate test</h3>
        <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onFormSubmit}>
          <input className="input input-bordered w-full sm:col-span-2" placeholder="Title" value={form.title} onChange={set('title')} required minLength={3} />

          <select className="select select-bordered w-full" value={form.subject} onChange={(e) => pickSubject(e.target.value)} required>
            <option value="">Pick a subject</option>
            {subjects.map((s) => (
              <option key={s.subject} value={s.subject}>
                {s.subject} ({s.count})
              </option>
            ))}
          </select>
          <input type="number" min={1} className="input input-bordered w-full" placeholder="Question count" value={form.count} onChange={set('count')} required />

          <div className="sm:col-span-2">
            <span className="fieldset-legend">Topics (optional)</span>
            <div className="flex max-h-36 flex-col gap-1 overflow-y-auto rounded-box border border-base-300 p-2">
              {subjectData && subjectData.topics.length ? (
                subjectData.topics.map((t) => (
                  <label key={t.topic} className="label cursor-pointer justify-start gap-3">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={form.topics.includes(t.topic)}
                      onChange={() => toggleTopic(t.topic)}
                    />
                    <span className="label-text">
                      {t.topic} ({t.count})
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-sm opacity-60">Pick a subject to see its topics.</p>
              )}
            </div>
          </div>

          <label className="fieldset">
            <span className="fieldset-legend">Difficulties (optional)</span>
            <div className="flex flex-col gap-1">
              {DIFFICULTIES.map((d) => (
                <label key={d.value} className="label cursor-pointer justify-start gap-3">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={form.difficulties.includes(d.value)}
                    onChange={() => toggleDifficulty(d.value)}
                  />
                  <span className="label-text">{d.label}</span>
                </label>
              ))}
            </div>
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Duration (minutes)</span>
            <input type="number" min={1} className="input input-bordered w-full" value={form.durationMinutes} onChange={set('durationMinutes')} />
          </label>

          <label className="fieldset">
            <span className="fieldset-legend">Negative marks</span>
            <input type="number" min={0} step="0.25" className="input input-bordered w-full" value={form.negativeMarks} onChange={set('negativeMarks')} />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Pass marks (optional)</span>
            <input type="number" min={0} step="0.5" className="input input-bordered w-full" value={form.passMarks} onChange={set('passMarks')} />
          </label>

          <label className="fieldset">
            <span className="fieldset-legend">Status</span>
            <select className="select select-bordered w-full" value={form.status} onChange={set('status')}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Max tab switches (0 = detection only)</span>
            <input type="number" min={0} max={50} className="input input-bordered w-full" value={form.maxTabSwitches} onChange={set('maxTabSwitches')} />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Max attempts (0 = unlimited)</span>
            <input type="number" min={0} max={20} className="input input-bordered w-full" value={form.maxAttempts} onChange={set('maxAttempts')} />
          </label>
          <label className="fieldset">
            <span className="fieldset-legend">Opens at (optional)</span>
            <input type="datetime-local" className="input input-bordered w-full" value={form.activeFrom} onChange={set('activeFrom')} />
          </label>
          <label className="fieldset sm:col-span-2">
            <span className="fieldset-legend">Closes at (optional)</span>
            <input type="datetime-local" className="input input-bordered w-full" value={form.activeUntil} onChange={set('activeUntil')} />
          </label>

          <label className="label cursor-pointer justify-start gap-3 sm:col-span-2">
            <input type="checkbox" className="toggle toggle-primary" checked={form.shuffle} onChange={(e) => setForm((f) => ({ ...f, shuffle: e.target.checked }))} />
            <span className="label-text">Shuffle questions</span>
          </label>

          <p className="text-sm opacity-70 sm:col-span-2">
            Available questions:{' '}
            <span className={`font-semibold ${notEnough ? 'text-error' : ''}`}>{available}</span>
          </p>

          <div className="modal-action sm:col-span-2">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || notEnough}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Generate'}
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

export default TestGenerateModal;