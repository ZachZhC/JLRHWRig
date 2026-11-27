import type { PointerEvent as ReactPointerEvent } from 'react';
import { DOOR_META } from '../domain/doors';
import type { Direction, DoorId, DoorSnapshot, InputSource } from '../domain/types';

type Stage = 'manual' | 'auto';

interface DoorPanelProps {
  door: DoorSnapshot;
  onPress: (id: DoorId, dir: Direction, source: InputSource, stage: Stage) => void;
  onRelease: (id: DoorId) => void;
}

export function DoorPanel({ door, onPress, onRelease }: DoorPanelProps) {
  const meta = DOOR_META[door.id];
  const closing = door.drive === 'UP';
  const opening = door.drive === 'DOWN';
  const stateLabel = door.moving ? (door.auto ? 'AUTO' : 'MAN') : 'IDLE';

  // 手动档：按下运行，松开停止
  const bindManual = (dir: Direction) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      onPress(door.id, dir, 'SCREEN', 'manual');
    },
    onPointerUp: () => onRelease(door.id),
    onPointerCancel: () => onRelease(door.id),
    onLostPointerCapture: () => onRelease(door.id),
  });

  // 自动档：单击触发，持续到极限位
  const bindAuto = (dir: Direction) => ({
    onClick: () => onPress(door.id, dir, 'SCREEN', 'auto'),
  });

  return (
    <article
      className={`door door-${door.id.toLowerCase()} ${door.moving ? 'is-moving' : ''}`}
      aria-label={`${door.id} ${meta.name}`}
    >
      <div className="door-head">
        <span className="door-id">{door.id}</span>
        <span className="door-name">{meta.name}</span>
        <span className="door-keys">
          <kbd>{meta.keys[0]}</kbd>
          <kbd>{meta.keys[1]}</kbd>
        </span>
      </div>

      <div className="door-shell">
        <div className="aperture">
          <div
            className="glass"
            style={{ transform: `translateY(${(100 - door.position).toFixed(2)}%)` }}
          >
            <div className="glass-glare" />
          </div>
          <div className="aperture-shade" />
        </div>

        <div className="belt" />

        <div className="trim">
          <span className="handle" aria-hidden="true" />
          <div className="rocker">
            <div className="rocker-row">
              <button
                type="button"
                className={`rocker-btn ${closing && !door.auto ? 'is-active' : ''}`}
                aria-label={`${meta.name} close window manual`}
                {...bindManual('UP')}
              >
                <span className="glyph">&#9650;</span>
                <span className="stage-tag">M</span>
              </button>
              <button
                type="button"
                className={`rocker-btn ${closing && door.auto ? 'is-active' : ''}`}
                aria-label={`${meta.name} close window auto`}
                {...bindAuto('UP')}
              >
                <span className="glyph">&#9650;</span>
                <span className="stage-tag">A</span>
              </button>
            </div>
            <div className="rocker-row">
              <button
                type="button"
                className={`rocker-btn ${opening && !door.auto ? 'is-active' : ''}`}
                aria-label={`${meta.name} open window manual`}
                {...bindManual('DOWN')}
              >
                <span className="glyph">&#9660;</span>
                <span className="stage-tag">M</span>
              </button>
              <button
                type="button"
                className={`rocker-btn ${opening && door.auto ? 'is-active' : ''}`}
                aria-label={`${meta.name} open window auto`}
                {...bindAuto('DOWN')}
              >
                <span className="glyph">&#9660;</span>
                <span className="stage-tag">A</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="door-foot">
        <span className="pos">{Math.round(door.position)}%</span>
        <span className={`st ${door.moving ? 'is-moving' : ''}`}>{stateLabel}</span>
      </div>
    </article>
  );
}
