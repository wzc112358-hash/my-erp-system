import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAuthStore } from './stores/auth.ts'

const clearLegacyPwaState = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  if ('caches' in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
  }
};

void clearLegacyPwaState().catch((error: unknown) => {
  console.warn('清理旧版离线缓存失败:', error);
});

void useAuthStore.getState().checkAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
