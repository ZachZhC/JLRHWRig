import { DOOR_META } from '../domain/doors';
import type { DoorSnapshot } from '../domain/types';

export function Telemetry({ doors }: { doors: DoorSnapshot[] }) {
  return (
    <section className="card telemetry">
      <div className="card-head">
        <h2>车窗状态</h2>
        <span className="tag">实时</span>
      </div>

      <div className="tele-rows">
        {doors.map((door) => {
          const position = Math.round(door.position);
          const state = door.moving ? (door.auto ? '自动' : '动作中') : '静止';
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
        按住开关持续升降 · 同向 0.4 s 内二次按下进入自动 · 自动运行中再次按键立即停止
      </p>
    </section>
  );
}
