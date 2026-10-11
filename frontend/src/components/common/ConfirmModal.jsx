import { useEffect, useRef } from 'react';

const ConfirmModal = ({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', onConfirm, onClose, tone = 'primary', submitting = false }) => {
  const ref = useRef(null);

  // daisyUI <dialog> traps focus; open/close is driven by the `modal` class.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box">
        <h3 className="text-lg font-bold">{title}</h3>
        {message && <p className="py-4 text-sm opacity-80">{message}</p>}
        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-${tone}`}
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? <span className="loading loading-spinner loading-sm" /> : confirmLabel}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
};

export default ConfirmModal;