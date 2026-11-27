import { useState } from 'react';
import type { FileSnapshot } from '../domain/fileStore';

/**
 * Trace 头栏下方的「文件自检条」：CAN 的 DBC 与 LIN 的 LDF 共用。
 * compact = 窄列（Windows 页右侧卡片）用，去掉背景和提示语。
 */
export function TraceFileBar<T>({
  snap,
  hint,
  emptyLabel = 'No file',
  compact = false,
}: {
  snap: FileSnapshot<T>;
  hint: string;
  emptyLabel?: string;
  compact?: boolean;
}) {
  const [showWarn, setShowWarn] = useState(false);
  const warnTotal = snap.warnings.length + snap.warningOverflow;
  const name =
    snap.status === 'ready'
      ? `${snap.fileName}${snap.source === 'default' ? ' (default)' : ''}`
      : snap.status === 'loading'
        ? 'Loading…'
        : snap.status === 'error'
          ? 'Load failed'
          : emptyLabel;

  return (
    <>
      <div className={`trc-file is-${snap.status}${compact ? ' is-compact' : ''}`}>
        <span className="trc-file-dot" />
        <span className="trc-file-name" title={snap.error || name}>
          {name}
        </span>
        {snap.status === 'ready' && (
          <span className="trc-file-meta">
            {snap.counts
              .map((c) => `${c.n} ${c.n === 1 && c.label.endsWith('s') ? c.label.slice(0, -1) : c.label}`)
              .join(' · ')}
          </span>
        )}
        {warnTotal > 0 && (
          <button
            type="button"
            className="trc-file-warn"
            title={snap.warnings.join('\n')}
            onClick={() => setShowWarn((v) => !v)}
          >
            {warnTotal} warning{warnTotal > 1 ? 's' : ''}
          </button>
        )}
        {snap.notice && <span className="trc-file-notice">{snap.notice}</span>}
        {snap.error && (
          <span className="trc-file-err" title={snap.error}>
            {snap.error}
          </span>
        )}
        {snap.status === 'empty' && !compact && <span className="trc-file-hint">{hint}</span>}
      </div>

      {showWarn && warnTotal > 0 && (
        <ul className="trc-file-list">
          {snap.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
          {snap.warningOverflow > 0 && <li>… {snap.warningOverflow} more not listed</li>}
        </ul>
      )}
    </>
  );
}