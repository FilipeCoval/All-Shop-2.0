import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminPage } from './src/features/admin/AdminPage';
import { registerAdminPwa } from './src/pwa/pwaClient';
import './src/styles/admin3.css';

registerAdminPwa();

const root = document.getElementById('admin-root');
if (!root) throw new Error('Não foi possível abrir a administração.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AdminPage />
  </React.StrictMode>,
);
