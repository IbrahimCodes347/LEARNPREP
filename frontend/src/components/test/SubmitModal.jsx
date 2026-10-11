import { useEffect, useRef } from 'react';

const SubmitModal = ({ open, answered, total, submitting, onConfirm, onClose }) => {
  const ref = useRef(null);
  const unanswered = total - answered;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box">
        <h3 className="text-lg font-bold">Submit test?</h3>
        <p className="py-4 text-sm">
          Answered {answered} / {total}
          {unanswered > 0 ? ` - ${unanswered} not attempted. Submit anyway?` : '. All questions answered.'}
        </p>
        {unanswered > 0 && (
          <p className="text-sm text-warning">Unanswered questions score zero.</p>
        )}
        <div className="modal-action">
          <button type="button" className="btn" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Submit'}
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

export default SubmitModal;