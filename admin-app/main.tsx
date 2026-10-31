import React from 'react';
import ReactDOM from 'react-dom/client';
import { AdminPage } from '../src/features/admin/AdminPage';
import { registerStandaloneAdminPwa } from '../src/pwa/pwaClient';
import '../src/styles/admin3.css';

registerStandaloneAdminPwa();

const root = document.getElementById('admin-root');
if (!root) throw new Error('Não foi possível abrir a administração.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <AdminPage storefrontUrl={import.meta.env.VITE_STOREFRONT_URL || 'https://www.all-shop.net/'} />
  </React.StrictMode>,
);
