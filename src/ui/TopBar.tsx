import { useEffect, useState } from 'react';

export type TestTab = 'window' | 'swm' | 'sws' | 'cwcm' | 'wdcm';

const TABS: { key: TestTab; label: string }[] = [
  { key: 'window', label: 'Windows Testing' },
  { key: 'swm', label: 'SWM Testing' },
  { key: 'sws', label: 'SWS Testing' },
  { key: 'cwcm', label: 'CWCM Testing' },
  { key: 'wdcm', label: 'WDCM Testing' },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

interface TopBarProps {
  activeTab: TestTab;
  onTabChange: (tab: TestTab) => void;
}

export function TopBar({ activeTab, onTabChange }: TopBarProps) {
  const now = useClock();
  const time = now.toLocaleTimeString('zh-CN', { hour12: false });

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <span>DP</span>
          <span>HW</span>
        </div>
        <div className="brand-text">
          <h1>DP-Hardware Team Rig</h1>
          <p>Test Version v0</p>
        </div>
      </div>

      <nav className="tabs" role="tablist" aria-label="测试页面切换">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tab ${activeTab === tab.key ? 'is-active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <span className="chip">
          <span className="dot" />
          模拟输入 SIM
        </span>
        <span className="clock">{time}</span>
      </div>
    </header>
  );
}
