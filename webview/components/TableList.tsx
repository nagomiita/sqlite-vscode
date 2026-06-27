import type { Labels } from '../../shared/protocol';
import type { TableInfo } from '../db/sqlite';
import { formatBytes } from '../format';

type TableMetricMode = 'rows' | 'size' | 'both';

type Props = {
  tables: TableInfo[];
  active: string | null;
  onSelect: (name: string) => void;
  labels: Labels | null;
  showLogical: boolean;
  width: number;
  metricMode: TableMetricMode;
  onMetricModeChange: (mode: TableMetricMode) => void;
};

export function TableList({
  tables,
  active,
  onSelect,
  labels,
  showLogical,
  width,
  metricMode,
  onMetricModeChange,
}: Props) {
  const maxRows = Math.max(0, ...tables.map((t) => t.rowCount ?? 0));
  const maxSize = Math.max(0, ...tables.map((t) => t.sizeBytes ?? 0));
  const showRows = metricMode === 'rows' || metricMode === 'both';
  const showSize = metricMode === 'size' || metricMode === 'both';

  return (
    <div className="sidebar" style={{ width }}>
      <div className="sidebar-header">
        <span>Tables &amp; Views</span>
        <div className="metric-toggle" aria-label="Table metrics">
          {(['rows', 'size', 'both'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={metricMode === mode ? 'active' : ''}
              onClick={() => onMetricModeChange(mode)}
              title={`Show ${mode} metrics`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <ul className="table-list">
        {tables.map((t) => {
          const logical = labels?.tables?.[t.name];
          const useLogical = showLogical && Boolean(logical);
          const rowPct =
            maxRows > 0 && t.rowCount !== null ? t.rowCount / maxRows : 0;
          const sizePct =
            maxSize > 0 && t.sizeBytes !== null ? t.sizeBytes / maxSize : 0;
          const rowText =
            t.rowCount === null ? null : `${t.rowCount.toLocaleString()} rows`;
          const sizeText =
            t.sizeBytes === null ? null : formatBytes(t.sizeBytes);
          const titleParts = [
            logical ? `${logical} (${t.name})` : t.name,
            rowText,
            sizeText ? `${sizeText} including indexes` : null,
          ].filter(Boolean);
          return (
            <li key={`${t.type}:${t.name}`}>
              <button
                type="button"
                className={`table-item${active === t.name ? ' active' : ''}`}
                onClick={() => onSelect(t.name)}
                title={titleParts.join(' - ')}
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
                <span className="table-metrics">
                  {showRows && rowText && (
                    <span className="metric-row">
                      <span className="metric-value">
                        {t.rowCount?.toLocaleString()}
                      </span>
                      <span className="metric-bar" aria-hidden="true">
                        <span style={{ width: `${rowPct * 100}%` }} />
                      </span>
                    </span>
                  )}
                  {showSize && sizeText && (
                    <span className="metric-row">
                      <span className="metric-value">{sizeText}</span>
                      <span className="metric-bar size" aria-hidden="true">
                        <span style={{ width: `${sizePct * 100}%` }} />
                      </span>
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {tables.length === 0 && <li className="empty">No tables found</li>}
      </ul>
    </div>
  );
}
