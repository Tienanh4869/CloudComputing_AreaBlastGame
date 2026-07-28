// src/main.jsx — React app entry point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#141d35',
            color: '#E8EAFF',
            border: '1px solid rgba(108,99,255,0.3)',
            fontFamily: "'Outfit', sans-serif",
          },
          success: { iconTheme: { primary: '#2ED573', secondary: '#141d35' } },
          error:   { iconTheme: { primary: '#FF4757', secondary: '#141d35' } },
        }}
      />
    </BrowserRouter>
  </React.StrictMode>
);
