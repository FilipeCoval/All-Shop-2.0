
import React, { useState, useEffect } from 'react';
import { X, Lock, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../services/firebaseConfig';

interface ResetPasswordModalProps {
  oobCode: string;
  onClose: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ oobCode, onClose }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Verificar se o código é válido e obter o email do utilizador
    const verifyCode = async () => {
      try {
        const userEmail = await auth.verifyPasswordResetCode(oobCode);
        setEmail(userEmail);
      } catch (err: any) {
        console.error("Erro ao verificar código:", err);
        setError("O link de recuperação é inválido ou já expirou. Por favor, peça um novo link através do formulário de login.");
      }
    };
    verifyCode();
  }, [oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError("A nova palavra-passe deve ter pelo menos 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As palavras-passe não coincidem.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await auth.confirmPasswordReset(oobCode, newPassword);
      setSuccess(true);
      
      // Limpar os parâmetros da URL para evitar que o modal abra novamente num refresh
      if (window.history.pushState) {
          const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.hash;
          window.history.pushState({path:newurl},'',newurl);
      }

      // Após sucesso, damos 3 segundos e fechamos para o utilizador poder fazer login
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (err: any) {
      console.error("Erro ao redefinir:", err);
      if (err.code === 'auth/expired-action-code') {
          setError("O código expirou. Peça um novo link.");
      } else {
          setError("Ocorreu um erro ao atualizar a palavra-passe. Tente novamente.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Nova Palavra-passe</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={24} /></button>
          </div>

          {success ? (
            <div className="py-8 text-center animate-fade-in">
              <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                <CheckCircle size={40} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Sucesso!</h3>
              <p className="text-gray-600">A sua palavra-passe foi atualizada. A fechar...</p>
            </div>
          ) : (
            <>
              {error ? (
                <div className="py-4">
                    <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-red-600 text-sm font-medium animate-shake">
                      <AlertCircle size={20} className="shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                    <button onClick={onClose} className="w-full py-3 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Voltar à Loja</button>
                </div>
              ) : (
                <>
                  {email && (
                    <div className="mb-6 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                      A definir acesso para: <span className="font-bold">{email}</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nova Palavra-passe</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input 
                          type={showPassword ? "text" : "password"} 
                          required
                          autoFocus
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                          placeholder="Mínimo 6 caracteres"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Confirmar Palavra-passe</label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input 
                          type="password" 
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                          placeholder="Repita a palavra-passe"
                        />
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={isLoading}
                      className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50"
                    >
                      {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Guardar Nova Palavra-passe'}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
