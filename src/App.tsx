import { lazy, Suspense } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { StoreProvider } from './lib/store';
import Home from './pages/Home';

const Players = lazy(() => import('./pages/Players'));
const Settings = lazy(() => import('./pages/Settings'));
const Stats = lazy(() => import('./pages/Stats'));
const Custom = lazy(() => import('./pages/Custom'));
const GamePage = lazy(() => import('./pages/GamePage'));
const OnlinePage = lazy(() => import('./online/OnlinePage'));

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Suspense fallback={<div className="screen centered center pulse pixel">LOADING…</div>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/spieler" element={<Players />} />
            <Route path="/einstellungen" element={<Settings />} />
            <Route path="/statistik" element={<Stats />} />
            <Route path="/eigene" element={<Custom />} />
            <Route path="/spiel/:id" element={<GamePage />} />
            <Route path="/online" element={<OnlinePage />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </StoreProvider>
  );
}
