import { useEffect, useState } from 'react';
import { TopBar, type TestTab } from './ui/TopBar';
import { WindowPage } from './ui/WindowPage';
import { SWMTesting } from './ui/SWMTesting';
import { SWSTesting } from './ui/SWSTesting';
import { CWCMTesting } from './ui/CWCMTesting';
import { WDCMTesting } from './ui/WDCMTesting';

/**
 * 设计基准分辨率：所有页面按这个尺寸排版，
 * 换到不同分辨率的显示器时只做整体等比缩放，排布完全一致。
 */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

export default function App() {
  const [activeTab, setActiveTab] = useState<TestTab>('window');
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () =>
      setScale(
        Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT),
      );
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div className="design-viewport">
      <div
        className="design-canvas"
        style={{
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <div className="app">
          <TopBar activeTab={activeTab} onTabChange={setActiveTab} />

          <main className="main">
            {activeTab === 'window' && <WindowPage />}
            {activeTab === 'swm' && <SWMTesting />}
            {activeTab === 'sws' && <SWSTesting />}
            {activeTab === 'cwcm' && <CWCMTesting />}
            {activeTab === 'wdcm' && <WDCMTesting />}
          </main>
        </div>
      </div>
    </div>
  );
}
