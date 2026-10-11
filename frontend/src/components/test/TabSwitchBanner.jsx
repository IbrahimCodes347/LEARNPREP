const TabSwitchBanner = ({ show, count = 0, limit = 0, onDismiss }) => {
  if (!show) return null;
  return (
    <div role="alert" className="alert alert-warning">
      <span>
        {limit > 0
          ? `You left the test window. Warning ${count} of ${limit} - reaching the limit submits the test.`
          : 'You left the test window. This has been recorded.'}
      </span>
      <button type="button" className="btn btn-sm btn-ghost" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
};

export default TabSwitchBanner;