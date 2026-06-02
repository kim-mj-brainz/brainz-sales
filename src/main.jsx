/* =============================================================
   진입점 (담당: 공통영역)
   ============================================================= */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './common/styles.css';
import { AppProvider } from './common/AppContext.jsx';
import App from './app/App.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
