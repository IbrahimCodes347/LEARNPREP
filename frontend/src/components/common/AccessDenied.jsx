export const AccessDenied = () => (
  <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
    <h2 className="text-2xl font-semibold">Access denied</h2>
    <p className="max-w-md text-sm opacity-70">
      You do not have permission to view this page. Ask an administrator if you think this is a mistake.
    </p>
    <a href="/" className="btn btn-primary">
      Back to dashboard
    </a>
  </div>
);

export default AccessDenied;