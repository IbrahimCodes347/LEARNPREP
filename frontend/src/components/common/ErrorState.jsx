export const ErrorState = ({ message = 'Something went wrong.', onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div className="alert alert-error max-w-md">
      <span>{message}</span>
    </div>
    {onRetry && (
      <button type="button" className="btn btn-primary" onClick={onRetry}>
        Try again
      </button>
    )}
  </div>
);

export default ErrorState;