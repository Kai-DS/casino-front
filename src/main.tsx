import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { SlotMachine } from './components/SlotMachine';

const root = document.getElementById('root');
if (root === null) throw new Error('No #root element');
createRoot(root).render(
  <StrictMode>
    <SlotMachine />
  </StrictMode>,
);
