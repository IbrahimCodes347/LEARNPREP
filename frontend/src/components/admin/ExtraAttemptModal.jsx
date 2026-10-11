import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { admin } from '../../api/endpoints';
import { Loader } from '../common/Loader';

/** Picks a student and grants one extra allowed attempt for a test. */
const ExtraAttemptModal = ({ open, test, submitting, onSubmit, onClose }) => {
  const ref = useRef(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelected(null);
    }
  }, [open]);

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'students', 'extra', search],
    queryFn: () => admin.listStudents({ search: search || undefined, page: 1, limit: 20 }),
    enabled: open
  });

  const students = data?.items ?? [];
  const idOf = (s) => s.id ?? s._id;

  const onFormSubmit = (e) => {
    e.preventDefault();
    if (selected) onSubmit({ userId: idOf(selected) });
  };

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box max-w-lg">
        <h3 className="text-lg font-bold">Give an extra attempt</h3>
        {test && <p className="text-sm opacity-70">{test.title}</p>}

        <form className="mt-3 flex flex-col gap-3" onSubmit={onFormSubmit}>
          <input
            className="input input-bordered w-full"
            placeholder="Search by name, username or roll number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-64 overflow-y-auto rounded-box border border-base-300">
            {isPending ? (
              <Loader />
            ) : students.length === 0 ? (
              <p className="p-3 text-sm opacity-60">No students found.</p>
            ) : (
              <ul className="menu w-full">
                {students.map((s) => (
                  <li key={idOf(s)}>
                    <button
                      type="button"
                      className={selected && idOf(selected) === idOf(s) ? 'menu-active' : ''}
                      onClick={() => setSelected(s)}
                    >
                      <span>{s.name}</span>
                      <span className="text-xs opacity-60">
                        {s.username} · {s.rollno ?? '-'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-xs opacity-60">
            {selected
              ? `Adds one more allowed attempt for ${selected.name}.`
              : 'Pick a student to grant one more attempt.'}
          </p>

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !selected}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Give attempt'}
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

export default ExtraAttemptModal;