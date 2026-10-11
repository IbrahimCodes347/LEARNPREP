export const EmptyState = ({ title = 'Nothing here yet', description, action }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <h3 className="text-lg font-semibold">{title}</h3>
    {description && <p className="max-w-md text-sm opacity-70">{description}</p>}
    {action}
  </div>
);

export default EmptyState;