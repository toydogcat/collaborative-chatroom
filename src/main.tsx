import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const base = (import.meta as any).env?.BASE_URL || '/';
    const swUrl = `${base.replace(/\/$/, '')}/sw.js`;
    navigator.serviceWorker.register(swUrl)
      .then((reg) => {
        console.log('Service Worker registered with scope: ', reg.scope);
      })
      .catch((err) => {
        console.error('Service Worker registration failed: ', err);
      });
  });
}
