import { DOOR_META } from '../domain/doors';
import type { DoorSnapshot } from '../domain/types';

export function Telemetry({ doors }: { doors: DoorSnapshot[] }) {
  return (
    <section className="card telemetry">
      <div className="card-head">
        <h2>Window Status</h2>
        <span className="tag">LIVE</span>
      </div>

      <div className="tele-rows">
        {doors.map((door) => {
          const position = Math.round(door.position);
          const state = door.moving ? (door.auto ? 'AUTO' : 'MOVING') : 'IDLE';
          return (
            <div className="tele-row" key={door.id}>
              <span className="tele-id">{door.id}</span>
              <span className="tele-name">{DOOR_META[door.id].name}</span>
              <div className="tele-bar">
                <i style={{ width: `${door.position}%` }} />
              </div>
              <span className="tele-pos">{String(position).padStart(2, '0')}%</span>
              <span className={`tele-st ${door.moving ? 'is-moving' : ''}`}>{state}</span>
            </div>
          );
        })}
      </div>

      <p className="card-note">
        Hold switch to move · second press within 0.4 s engages auto · press again while auto to stop
      </p>
    </section>
  );
}
