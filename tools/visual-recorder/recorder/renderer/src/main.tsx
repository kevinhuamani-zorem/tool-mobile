import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor React');

createRoot(root).render(<App />);
