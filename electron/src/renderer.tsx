import { createRoot } from 'react-dom/client';
import './renderer/styles/fonts.css';
import './renderer/styles/global.scss';
import App from './renderer/app';

const container = document.getElementById('root')!;
createRoot(container).render(<App />);
