import React from 'react';
import { STORE_NAME, LOGO_URL } from '../../constants';

export const Maintenance = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-950 text-white min-h-screen z-50">
      <div className="text-center p-8 max-w-lg">
        {LOGO_URL && (
          <img src={LOGO_URL} alt={STORE_NAME} className="mx-auto h-24 mb-6 object-contain" />
        )}
        <h1 className="text-4xl font-bold mb-6 tracking-tight">Estamos em Manutenção</h1>
        <p className="text-gray-400 text-lg">
          Estamos a atualizar os nossos sistemas e a preparar novidades. 
          Voltaremos a estar disponíveis muito em breve.
        </p>
      </div>
    </div>
  );
};
