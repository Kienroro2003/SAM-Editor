/**
 * SAM Code Editor — React Entry Point
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

import './styles/index.css';
import './styles/layout.css';
import './styles/sidebar.css';
import './styles/editor.css';
import './styles/terminal.css';
import './styles/command-palette.css';
import './styles/statusbar.css';

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
