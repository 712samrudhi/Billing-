import React, { useEffect, useRef, useState } from 'react';
import appMarkup from './appMarkup.html?raw';
import { initKrushiApp } from './krushiApp.js';
import { onOutboxChange, syncOutbox } from './dbClient.js';

// This component preserves the ORIGINAL app's structure exactly:
// - appMarkup.html is the exact same markup that used to sit inside
//   <body> in the single-file HTML version (#krushi-root, #krushi-login,
//   #krushi-toast, #krushi-print-invoice) — untouched.
// - initKrushiApp() is the exact same script that used to run at the
//   bottom of <body> — untouched, just wrapped as an exported function.
// React's only job here is to mount that markup once, hand control to the
// original imperative app, and show a small offline/sync status strip that
// dbClient.js's offline queue reports through — none of it touches the
// original app's own DOM or logic.
export default function App() {
  const initialized = useRef(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    if (initialized.current) return; // guard against React 18 StrictMode double-invoke
    initialized.current = true;
    initKrushiApp();
  }, []);

  useEffect(() => {
    const goOnline = () => { setOnline(true); syncOutbox(); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribe = onOutboxChange(setPending);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
    };
  }, []);

  return (
    <>
      {(!online || pending > 0) && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 99999,
            textAlign: 'center',
            padding: '6px 12px',
            fontSize: 13,
            fontFamily: 'sans-serif',
            color: '#fff',
            background: online ? '#b45309' : '#7f1d1d'
          }}
        >
          {online
            ? `Syncing ${pending} change${pending === 1 ? '' : 's'}…`
            : pending > 0
            ? `Offline — working from saved data, ${pending} change${pending === 1 ? '' : 's'} waiting to sync`
            : 'Offline — working from saved data'}
        </div>
      )}
      <div
        id="krushi-app-mount"
        dangerouslySetInnerHTML={{ __html: appMarkup }}
      />
    </>
  );
}
