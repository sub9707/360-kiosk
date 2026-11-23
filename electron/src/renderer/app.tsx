import { HashRouter, Route, Routes } from 'react-router-dom';
import { useHotkey } from './hooks/useHotkey';
import Home from './pages/Home';
import Result from './pages/Result';
import Shoot from './pages/Shoot';

export default function App() {
  useHotkey('PageUp');
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/shoot" element={<Shoot />} />
        <Route path="/result" element={<Result />} />
      </Routes>
    </HashRouter>
  );
}
