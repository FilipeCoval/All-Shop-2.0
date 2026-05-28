import React, { useState, useEffect, useRef } from 'react';
import { ProductRequest } from '../types';
import { modularDb, storage, requestPushPermission } from '../services/firebaseConfig';
import { collection, addDoc, onSnapshot, query, where, orderBy, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Loader2, Plus, Camera, X, Package, DollarSign, Image as ImageIcon, Bell } from 'lucide-react';

interface RequestsTabProps {
    user: any;
    isAdmin: boolean;
}

const CATEGORIES = ['Smartphones', 'Computadores', 'TVs', 'Consolas', 'Roupa', 'Ferramentas', 'Eletrodomésticos', 'Automóveis', 'Outros'];
const PRODUCT_STATES = ['Novo', 'Semi-novo', 'Recondicionado', 'Usado', 'Qualquer estado'];
const URGENCY_LEVELS = ['Não tenho pressa', 'Nos próximos dias', 'Urgente'];

const RequestsTab: React.FC<RequestsTabProps> = ({ user, isAdmin }) => {
    const [requests, setRequests] = useState<ProductRequest[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);

    const [formData, setFormData] = useState({
        productName: '',
        category: '',
        state: '',
        urgency: '',
        specifications: '',
        details: '',
        budgetRange: '',
        referenceLink: '',
        notificationsEnabled: false
    });
    const [photos, setPhotos] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const q = isAdmin 
            ? query(collection(modularDb, 'product_requests'), orderBy('createdAt', 'desc'))
            : query(collection(modularDb, 'product_requests'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
        
        return onSnapshot(q, (snapshot) => {
            setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductRequest)));
        });
    }, [isAdmin, user.uid]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const storageRef = ref(storage, `requests/${user.uid}/${Date.now()}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on('state_changed', null, (err) => { console.error(err); setIsUploading(false); }, async () => {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            setPhotos(prev => [...prev, url]);
            setIsUploading(false);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.notificationsEnabled) {
            try {
                await requestPushPermission();
            } catch (err) {
                console.error("Failed to request push permissions", err);
            }
        }
        try {
            await addDoc(collection(modularDb, 'product_requests'), {
                userId: user.uid,
                ...formData,
                status: 'Análise',
                photos,
                createdAt: new Date().toISOString()
            });
            setIsFormOpen(false);
            setFormData({ productName: '', category: '', state: '', urgency: '', specifications: '', details: '', budgetRange: '', referenceLink: '', notificationsEnabled: false });
            setPhotos([]);
        } catch (e) {
            alert('Erro ao publicar pedido.');
        }
    };

    const updateStatus = async (id: string, status: 'Concluído' | 'Anulado') => {
        await updateDoc(doc(modularDb, 'product_requests', id), { status });
    };

    return (
        <div className="space-y-8">
            {!isAdmin && !isFormOpen && (
                <button onClick={() => setIsFormOpen(true)} className="bg-primary text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 shadow-lg hover:shadow-xl transition-shadow">
                    <Plus size={22} /> Publicar Novo Pedido
                </button>
            )}

            {isFormOpen && (
                <form onSubmit={handleSubmit} className="bg-white dark:bg-[#0f172a] p-8 rounded-3xl shadow-sm border dark:border-slate-800 space-y-8 max-w-3xl">
                    <h3 className="text-xl font-bold flex items-center gap-2"><Package className="text-primary"/> Produto</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <input required placeholder="Nome do Produto" className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value})} />
                        <select required className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                            <option value="">Categoria</option>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <select required className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})}>
                            <option value="">Estado pretendido</option>
                            {PRODUCT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select required className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" value={formData.urgency} onChange={e => setFormData({...formData, urgency: e.target.value})}>
                            <option value="">Urgência</option>
                            {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <textarea required placeholder="Ex: 256GB, 16GB RAM, 120Hz, 2000W, tamanho XL, cor preta..." className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" rows={3} value={formData.specifications} onChange={e => setFormData({...formData, specifications: e.target.value})} />
                    <textarea required placeholder="Descreva exatamente o que procura, estado do produto, cor, funcionalidades ou preferências." className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" rows={4} value={formData.details} onChange={e => setFormData({...formData, details: e.target.value})} />

                    <h3 className="text-xl font-bold flex items-center gap-2"><DollarSign className="text-primary"/> Orçamento</h3>
                    <input required placeholder="Ex: 800€ - 1000€" className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" value={formData.budgetRange} onChange={e => setFormData({...formData, budgetRange: e.target.value})} />
                    <p className="text-xs text-gray-500">Indique um valor próximo do preço real de mercado para receber propostas mais relevantes.</p>

                    <h3 className="text-xl font-bold flex items-center gap-2"><ImageIcon className="text-primary"/> Referências</h3>
                    <div className="space-y-4">
                        <label className="text-sm font-medium">Link de referência</label>
                        <input placeholder="Cole aqui um link de exemplo do produto (Amazon, Worten, Fnac, etc.)" className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900" value={formData.referenceLink} onChange={e => setFormData({...formData, referenceLink: e.target.value})} />
                    </div>
                    <div className="flex items-center gap-4">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 p-4 border rounded-xl bg-gray-50 dark:bg-slate-800">
                            <Camera size={20} /> Adicionar fotos de referência
                        </button>
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                        {isUploading && <Loader2 className="animate-spin" />}
                        <div className="flex gap-2 flex-wrap"> 
                            {photos.map((p, i) => <img key={i} src={p} className="w-16 h-16 object-cover rounded-lg" />)} 
                        </div>
                    </div>
                    <p className="text-xs text-gray-500">Pode enviar imagens do produto desejado ou exemplos semelhantes.</p>

                    <h3 className="text-xl font-bold flex items-center gap-2"><Bell className="text-primary"/> Notificações</h3>
                    <label className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-800 rounded-xl">
                        <input required type="checkbox" className="w-5 h-5" checked={formData.notificationsEnabled} onChange={e => setFormData({...formData, notificationsEnabled: e.target.checked})} />
                        <div className="flex flex-col">
                            <span className="text-sm font-bold">Receber notificações sobre propostas e atualizações deste pedido.</span>
                            <span className="text-xs text-amber-600">Atenção: É necessário ativar as permissões de notificação do seu navegador para receber alertas.</span>
                        </div>
                    </label>

                    <div className="flex gap-4 pt-4">
                        <button type="button" onClick={() => setIsFormOpen(false)} className="px-8 py-4 border rounded-2xl font-bold">Cancelar</button>
                        <button type="submit" className="px-8 py-4 bg-primary text-white rounded-2xl font-bold">Publicar Pedido</button>
                    </div>
                </form>
            )}

            <div className="bg-white dark:bg-[#0f172a] rounded-3xl shadow-sm border dark:border-slate-800 overflow-hidden">
                <table className="w-full text-left">
                  <thead><tr className="border-b dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50"><th className="p-6">Produto</th><th className="p-6">Orçamento</th><th className="p-6">Estado</th>{isAdmin && <th className="p-6">Ações</th>}</tr></thead>
                  <tbody className="divide-y dark:divide-slate-800">
                      {requests.map(r => (
                          <tr key={r.id}>
                              <td className="p-6">
                                  <div className="font-bold">{r.productName}</div>
                                  <div className="text-xs text-gray-500">{r.category} • {r.state}</div>
                              </td>
                              <td className="p-6 font-mono">{r.budgetRange}</td>
                              <td className="p-6"><span className={`px-3 py-1 rounded-full text-xs font-bold ${r.status === 'Análise' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100'}`}>{r.status}</span></td>
                              {isAdmin && (
                                  <td className="p-6 space-x-2">
                                      <button onClick={() => updateStatus(r.id, 'Concluído')} className="text-green-600 text-sm font-bold">Concluir</button>
                                      <button onClick={() => updateStatus(r.id, 'Anulado')} className="text-red-600 text-sm font-bold">Anular</button>
                                  </td>
                              )}
                          </tr>
                      ))}
                  </tbody>
                </table>
            </div>
        </div>
    );
};

export default RequestsTab;
