import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Film from './pages/Film';
import QRPage from './pages/QRPage';

const App: React.FC = () => {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/film" element={<Film />} />
                <Route path="/result" element={<QRPage />} />
            </Routes>
        </Router>
    );
};

export default App;
