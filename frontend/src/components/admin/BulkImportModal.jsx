import { useEffect, useRef, useState } from 'react';

const BulkImportModal = ({ open, kind = 'students', onSubmit, submitting, result, onClose }) => {
  const ref = useRef(null);
  const [file, setFile] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal-box">
        <h3 className="text-lg font-bold">Bulk import {kind}</h3>
        <p className="py-2 text-sm opacity-70">
          Upload a .csv or .json file (max 1 MB). Bad rows are reported and skipped; the rest are saved.
        </p>

        <input
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="file-input file-input-bordered w-full"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        {result && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="stats stats-horizontal w-full shadow">
              <div className="stat py-2">
                <div className="stat-title text-xs">Created</div>
                <div className="stat-value text-2xl text-success">{result.createdCount ?? 0}</div>
              </div>
              <div className="stat py-2">
                <div className="stat-title text-xs">Failed</div>
                <div className="stat-value text-2xl text-error">{result.errorCount ?? 0}</div>
              </div>
              <div className="stat py-2">
                <div className="stat-title text-xs">Total</div>
                <div className="stat-value text-2xl">{result.total ?? 0}</div>
              </div>
            </div>

            {(result.errors ?? []).length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-box border border-base-300 p-2">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i}>
                        <td>{e.row}</td>
                        <td className="text-error">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="modal-action">
          <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={submitting}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || submitting}
            onClick={() => onSubmit(file)}
          >
            {submitting ? <span className="loading loading-spinner loading-sm" /> : 'Import'}
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button">close</button>
      </form>
    </dialog>
  );
};

export default BulkImportModal;