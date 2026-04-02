import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Handle Supabase refresh token errors globally
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && (
    event.reason.message.includes('Refresh Token Not Found') || 
    event.reason.message.includes('Invalid Refresh Token')
  )) {
    console.warn('Supabase auth error caught globally:', event.reason.message);
    event.preventDefault(); // Prevent the error from showing up in the UI/console as an unhandled rejection
    // The session will be cleared by the auth listener
  }
});

window.addEventListener('error', (event) => {
  if (event.message && (
    event.message.includes('Refresh Token Not Found') || 
    event.message.includes('Invalid Refresh Token')
  )) {
    console.warn('Supabase auth error caught globally:', event.message);
    event.preventDefault();
  }
});

const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('Nova atualização disponível. Recarregar?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App pronto para uso offline');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
