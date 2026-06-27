import { useState } from 'react';
import { guardReadOnlySql } from '../db/guard';

type Props = {
  onRun: (sql: string) => void;
  error: string | null;
};

export function SqlRunner({ onRun, error }: Props) {
  const [sql, setSql] = useState('');
  const [guardError, setGuardError] = useState<string | null>(null);

  const run = () => {
    const guard = guardReadOnlySql(sql);
    if (!guard.ok) {
      setGuardError(guard.reason);
      return;
    }
    setGuardError(null);
    onRun(sql);
  };

  return (
    <div className="sql-runner">
      <textarea
        className="sql-input"
        placeholder="SELECT * FROM ...  (read-only)"
        value={sql}
        spellCheck={false}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            run();
          }
        }}
      />
      <div className="sql-actions">
        <button type="button" className="run-btn" onClick={run}>
          Run (Ctrl/⌘+Enter)
        </button>
        {(guardError || error) && (
          <span className="sql-error">{guardError ?? error}</span>
        )}
      </div>
    </div>
  );
}
