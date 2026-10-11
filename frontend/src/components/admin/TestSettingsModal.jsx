import { useEffect, useRef, useState } from 'react';

/** Edits the settings of an existing test (the tab-switch limit today). */
const TestSettingsModal = ({ open, test, submitting, onSubmit, onClose }) => {
  const ref = useRef(null);
  const [maxTabSwitches, setMaxTabSwitches] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (open) {
      setMaxTabSwitches(test?.maxTabSwitches ?? 0);
      setMaxAttempts(test?.maxAttempts ?? 0);
    }
  }, [open, test]);

  const onFormSubmit = (e) => {
    e.preventDefault();
    onSubmit({
      maxTabSwitches: Number(maxTabSwitches) || 0,
      maxAttempts: Number(maxAttempts) || 0
    });
  };

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box max-w-md">
        <h3 className="text-lg font-bold">Test settings</h3>
        {test && <p className="text-sm opacity-70">{test.title}</p>}

        <form className="mt-3 grid gap-2" onSubmit={onFormSubmit}>
          <label className="fieldset">
            <span className="fieldset-legend">Max tab switches (0 = detection only)</span>
            <input
              type="number"
              min={0}
              max={50}
              className="input input-bordered w-full"
              value={maxTabSwitches}
              onChange={(e) => setMaxTabSwitches(e.target.value)}
            />
          </label>

          <label className="fieldset">
            <span className="fieldset-legend">Max attempts (0 = unlimited)</span>
            <input
              type="number"
              min={0}
              max={20}
              className="input input-bordered w-full"
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
            />
          </label>

          <div className="modal-action">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Save'}
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

export default TestSettingsModal;