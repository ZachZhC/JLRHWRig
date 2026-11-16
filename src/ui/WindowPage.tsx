import { useEffect, useSyncExternalStore } from 'react';
import { WindowBench } from '../domain/bench';
import { DOOR_IDS, KEY_MAP } from '../domain/doors';
import type { Direction, DoorId, InputSource } from '../domain/types';
import { DoorPanel } from './DoorPanel';
import { CarFigure } from './CarFigure';
import { Telemetry } from './Telemetry';
import { EventLog } from './EventLog';

/** WindowBench 单实例（模块级，保证全应用共享，RAF 循环也只跑一份） */
const bench = new WindowBench();

export function WindowPage() {
  const snapshot = useSyncExternalStore(bench.subscribe, bench.getSnapshot);

  useEffect(() => {
    const held = new Set<string>();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const mapping = KEY_MAP[key];
      if (!mapping) return;
      event.preventDefault();
      if (held.has(key)) return;
      held.add(key);
      // Shift 键 = 自动档，普通 = 手动档
      bench.press(mapping.door, mapping.dir, 'KEYBOARD', event.shiftKey ? 'auto' : 'manual');
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mapping = KEY_MAP[key];
      if (!mapping || !held.has(key)) return;
      held.delete(key);
      bench.release(KEY_MAP[key].door);
    };

    const onBlur = () => {
      held.forEach((key) => bench.release(KEY_MAP[key].door));
      held.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const handlePress = (id: DoorId, dir: Direction, source: InputSource, stage: 'manual' | 'auto' = 'manual') =>
    bench.press(id, dir, source, stage);
  const handleRelease = (id: DoorId) => bench.release(id);

  return (
    <>
      <section className="stage" aria-label="四门车窗展开视图">
        {DOOR_IDS.map((id) => {
          const door = snapshot.doors.find((item) => item.id === id);
          if (!door) return null;
          return (
            <DoorPanel
              key={id}
              door={door}
              onPress={handlePress}
              onRelease={handleRelease}
            />
          );
        })}
        <CarFigure />
      </section>

      <aside className="side">
        <Telemetry doors={snapshot.doors} />
        <EventLog events={snapshot.events} onClear={bench.clearEvents} />
      </aside>
    </>
  );
}
