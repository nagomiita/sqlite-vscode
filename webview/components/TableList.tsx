import type { TableInfo } from '../db/sqlite';

type Props = {
  tables: TableInfo[];
  active: string | null;
  onSelect: (name: string) => void;
};

export function TableList({ tables, active, onSelect }: Props) {
  return (
    <div className="sidebar">
      <div className="sidebar-header">Tables &amp; Views</div>
      <ul className="table-list">
        {tables.map((t) => (
          <li key={`${t.type}:${t.name}`}>
            <button
              type="button"
              className={`table-item${active === t.name ? ' active' : ''}`}
              onClick={() => onSelect(t.name)}
              title={t.name}
            >
              <span className={`badge badge-${t.type}`}>
                {t.type === 'view' ? 'V' : 'T'}
              </span>
              <span className="table-name">{t.name}</span>
              {t.rowCount !== null && (
                <span className="row-count">{t.rowCount.toLocaleString()}</span>
              )}
            </button>
          </li>
        ))}
        {tables.length === 0 && <li className="empty">No tables found</li>}
      </ul>
    </div>
  );
}
