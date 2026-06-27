import type { Labels } from '../../shared/protocol';
import type { TableInfo } from '../db/sqlite';

type Props = {
  tables: TableInfo[];
  active: string | null;
  onSelect: (name: string) => void;
  labels: Labels | null;
  showLogical: boolean;
  width: number;
};

export function TableList({
  tables,
  active,
  onSelect,
  labels,
  showLogical,
  width,
}: Props) {
  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-header">Tables &amp; Views</div>
      <ul className="table-list">
        {tables.map((t) => {
          const logical = labels?.tables?.[t.name];
          const useLogical = showLogical && Boolean(logical);
          return (
            <li key={`${t.type}:${t.name}`}>
              <button
                type="button"
                className={`table-item${active === t.name ? ' active' : ''}`}
                onClick={() => onSelect(t.name)}
                title={logical ? `${logical} (${t.name})` : t.name}
              >
                <span className={`badge badge-${t.type}`}>
                  {t.type === 'view' ? 'V' : 'T'}
                </span>
                <span className="table-name">
                  <span className="name-primary">
                    {useLogical ? logical : t.name}
                  </span>
                  {useLogical && (
                    <span className="name-sub">{t.name}</span>
                  )}
                </span>
                {t.rowCount !== null && (
                  <span className="row-count">
                    {t.rowCount.toLocaleString()}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {tables.length === 0 && <li className="empty">No tables found</li>}
      </ul>
    </div>
  );
}
