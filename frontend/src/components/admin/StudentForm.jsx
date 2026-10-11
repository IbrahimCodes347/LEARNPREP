import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { config } from '../../api/endpoints';

const EMPTY = { name: '', username: '', email: '', rollno: '', grade: '', password: '' };

const StudentForm = ({ open, onSubmit, submitting, initial, mode = 'create', onClose }) => {
  const ref = useRef(null);
  const [form, setForm] = useState(EMPTY);
  const isEdit = mode === 'edit';

  const { data: appConfig } = useQuery({
    queryKey: ['app', 'config'],
    queryFn: config.get
  });

  const gradeOptions = useMemo(() => appConfig?.gradeOptions ?? [], [appConfig?.gradeOptions]);
  // A legacy value that is no longer selectable stays untouched on save (the
  // server allowlist rejects it), so it is only ever shown in edit mode.
  const isLegacyGrade = useMemo(
    () => isEdit && Boolean(initial?.grade) && !gradeOptions.includes(initial.grade),
    [isEdit, initial?.grade, gradeOptions]
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      // A legacy class that is no longer selectable must not be re-sent, so it
      // is collapsed to the blank option ("keep current class" on save).
      setForm({
        ...EMPTY,
        ...(initial ?? {}),
        ...(isEdit && isLegacyGrade ? { grade: '' } : {})
      });
    }
  }, [open, initial, isEdit, isLegacyGrade]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const onFormSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form };
    if (isEdit) {
      // Blank identifiers are sent as null so the admin can clear them; a blank
      // password means "keep the current one".
      for (const key of ['username', 'email', 'rollno']) {
        if (!payload[key]) payload[key] = null;
      }
      if (!payload.grade) delete payload.grade;
      if (!payload.password) delete payload.password;
    } else {
      // Omit blank optional fields so the strict server schema does not 400.
      if (!payload.email) delete payload.email;
      if (!payload.rollno) delete payload.rollno;
      if (!payload.grade) delete payload.grade;
    }
    onSubmit(payload);
  };

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box">
        <h3 className="text-lg font-bold">{isEdit ? 'Edit student' : 'Create student'}</h3>
        <form className="mt-3 flex flex-col gap-2" onSubmit={onFormSubmit}>
          <input className="input input-bordered w-full" placeholder="Full name" value={form.name} onChange={set('name')} required />
          <input className="input input-bordered w-full" placeholder="Username (optional)" value={form.username} onChange={set('username')} />
          <input type="email" className="input input-bordered w-full" placeholder="Email (optional)" value={form.email} onChange={set('email')} />
          <input className="input input-bordered w-full" placeholder="Roll number (optional)" value={form.rollno} onChange={set('rollno')} />
          <select
            className="select select-bordered w-full"
            value={form.grade}
            onChange={set('grade')}
            aria-label="Class"
          >
            <option value="">Unassigned</option>
            {gradeOptions.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          {isLegacyGrade && (
            <p className="text-xs opacity-60">
              Stored class “{initial.grade}” is not a listed option and will be kept unchanged.
            </p>
          )}
          <input
            type="password"
            className="input input-bordered w-full"
            placeholder={isEdit ? 'Reset password (leave blank to keep)' : 'Password'}
            value={form.password}
            onChange={set('password')}
            required={!isEdit}
          />
          <p className="text-xs opacity-60">
            Role is fixed to student. Admin accounts can only be created by the seed script.
          </p>
          <p className="text-xs opacity-60">
            Username, email or roll number - at least one is required, since the student logs in with it.
          </p>

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : isEdit ? 'Save' : 'Create'}
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

export default StudentForm;