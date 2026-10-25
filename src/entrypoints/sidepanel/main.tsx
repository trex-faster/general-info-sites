import { createRoot } from 'react-dom/client';
import { App } from '@/ui/panel/App';
import '@/ui/panel/style.css';

import { initEngine } from '@/engines';

initEngine();
createRoot(document.getElementById('root')!).render(<App />);
