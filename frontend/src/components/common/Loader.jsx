export const Loader = ({ label = 'Loading…' }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16" role="status" aria-live="polite">
    <span className="loading loading-spinner loading-lg text-primary" />
    <span className="text-sm opacity-70">{label}</span>
  </div>
);

export default Loader;