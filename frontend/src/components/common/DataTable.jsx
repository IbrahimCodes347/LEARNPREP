/** Wide tables scroll inside the card, never the whole page. */
const DataTable = ({ columns, rows, keyField = 'id', empty = 'No rows', onRowClick }) => (
  <div className="overflow-x-auto">
    <table className="table table-zebra">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.headerClass ?? ''}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="py-8 text-center opacity-60">
              {empty}
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row[keyField]}
              className={onRowClick ? 'cursor-pointer hover:bg-base-200' : ''}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={c.cellClass ?? ''}>
                  {c.render ? c.render(row) : (row[c.key] ?? '-')}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
);

export default DataTable;