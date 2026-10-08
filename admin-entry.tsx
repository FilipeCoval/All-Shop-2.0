import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminPage } from './src/features/admin/AdminPage';
import './src/styles/admin3.css';

const root = document.getElementById('admin-root');
if (!root) throw new Error('Não foi possível abrir a administração.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AdminPage />
  </React.StrictMode>,
);
