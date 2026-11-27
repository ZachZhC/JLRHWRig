import type { BenchEvent } from '../domain/types';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour12: false });
}

export function EventLog({ events, onClear }: { events: BenchEvent[]; onClear: () => void }) {
  return (
    <section className="card log">
      <div className="card-head">
        <h2>LIN Trace</h2>
        <button type="button" className="ghost" onClick={onClear} disabled={events.length === 0}>
          Clear
        </button>
      </div>

      <ul className="log-list">
        {events.length === 0 && <li className="log-empty">Waiting for switch input…</li>}
        {events.map((event) => (
          <li key={event.id} className={`log-item is-${event.tone}`}>
            <span className="log-time">{formatTime(event.ts)}</span>
            <span className="log-door">{event.door ?? 'SYS'}</span>
            <span className="log-body">
              <span className="log-title">{event.title}</span>
              {event.detail && <span className="log-detail">{event.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
