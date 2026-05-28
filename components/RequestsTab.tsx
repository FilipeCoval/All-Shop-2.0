import React, { useState, useEffect, useRef } from 'react';
import { ProductRequest } from '../types';
import { modularDb, storage, requestPushPermission } from '../services/firebaseConfig';
import { collection, addDoc, onSnapshot, query, where, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { 
    Loader2, Plus, Camera, X, Package, DollarSign, Image as ImageIcon, Bell, 
    ChevronDown, ChevronUp, ExternalLink, Calendar, Eye, CheckCircle2, XCircle, 
    MessageSquare, Clock, Tag, User, ShieldAlert 
} from 'lucide-react';

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
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);
    const [adminComments, setAdminComments] = useState<{[key: string]: string}>({});
    const [isSavingComment, setIsSavingComment] = useState<{[key: string]: boolean}>({});

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
        // Simple query that gets sorted in-memory, zero Firebase compound indexes required!
        const q = isAdmin 
            ? query(collection(modularDb, 'product_requests'))
            : query(collection(modularDb, 'product_requests'), where('userId', '==', user.uid));
        
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductRequest));
                const sorted = docs.sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return dateB - dateA;
                });
                setRequests(sorted);
                
                // Prefill existing admin comments
                const commentsMap: {[key: string]: string} = {};
                docs.forEach(doc => {
                    if (doc.adminComment) {
                        commentsMap[doc.id] = doc.adminComment;
                    }
                });
                setAdminComments(commentsMap);
            },
            (err) => {
                console.error("[RequestsTab] Erro ao carregar/escutar pedidos de produtos:", err);
            }
        );
        return () => unsubscribe();
    }, [isAdmin, user.uid]);

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        const storageRef = ref(storage, `requests/${user.uid}/${Date.now()}`);
        const uploadTask = uploadBytesResumable(storageRef, file);
        uploadTask.on('state_changed', null, (err) => { 
            console.error(err); 
            setIsUploading(false); 
            alert('Erro ao enviar imagem. Sem permissão ou excedeu o limite do Firebase Storage.');
        }, async () => {
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
            const docData = {
                userId: user.uid,
                userEmail: user.email || '',
                productName: formData.productName,
                category: formData.category,
                state: formData.state,
                urgency: formData.urgency,
                specifications: formData.specifications,
                details: formData.details,
                budgetRange: formData.budgetRange,
                referenceLink: formData.referenceLink,
                notificationsEnabled: formData.notificationsEnabled,
                status: 'Análise',
                photos,
                createdAt: new Date().toISOString()
            };
            await addDoc(collection(modularDb, 'product_requests'), docData);
            setIsFormOpen(false);
            setFormData({ productName: '', category: '', state: '', urgency: '', specifications: '', details: '', budgetRange: '', referenceLink: '', notificationsEnabled: false });
            setPhotos([]);
        } catch (err: any) {
            console.error("[RequestsTab] Erro ao publicar pedido:", err);
            alert('Erro ao publicar pedido: ' + (err.message || String(err)));
        }
    };

    const updateStatus = async (id: string, status: 'Concluído' | 'Anulado') => {
        try {
            const comment = adminComments[id] || '';
            await updateDoc(doc(modularDb, 'product_requests', id), { 
                status,
                adminComment: comment
            });
        } catch (err: any) {
            console.error("[RequestsTab] Erro ao mudar estado do pedido:", err);
            alert("Erro ao mudar estado: " + err.message);
        }
    };

    const saveAdminCommentOnly = async (id: string) => {
        setIsSavingComment(prev => ({ ...prev, [id]: true }));
        try {
            const comment = adminComments[id] || '';
            await updateDoc(doc(modularDb, 'product_requests', id), { 
                adminComment: comment
            });
            alert("Comentário ou proposta guardada com sucesso!");
        } catch (err: any) {
            console.error("[RequestsTab] Erro ao gravar comentário:", err);
            alert("Erro ao gravar comentário: " + err.message);
        } finally {
            setIsSavingComment(prev => ({ ...prev, [id]: false }));
        }
    };

    const handleUserDecision = async (id: string, decision: 'Aceite' | 'Recusada') => {
        try {
            await updateDoc(doc(modularDb, 'product_requests', id), { 
                userDecision: decision
            });
            // Adicionalmente podemos alertar o admin ou mudar o status se for rejeitado
            if (decision === 'Recusada') {
                // Se o user recusa, opcionalmente podemos deixar em análise para o admin ver e propor outra coisa
            }
        } catch (err: any) {
            console.error("[RequestsTab] Erro ao gravar decisão do utilizador:", err);
            alert("Erro ao gravar decisão: " + err.message);
        }
    };

    const getUrgencyBadge = (urgency: string) => {
        switch (urgency) {
            case 'Urgente':
                return <span className="bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><ShieldAlert size={12}/> Urgente</span>;
            case 'Nos próximos dias':
                return <span className="bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><Clock size={12}/> Em breve</span>;
            default:
                return <span className="bg-slate-50 dark:bg-slate-800 text-gray-600 dark:text-slate-300 border border-gray-200 dark:border-slate-700 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1"><Calendar size={12}/> Sem pressa</span>;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Concluído':
                return <span className="bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-900 flex items-center gap-1.5"><CheckCircle2 size={13}/> Concluído</span>;
            case 'Anulado':
                return <span className="bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-400 px-3 py-1 rounded-full text-xs font-bold border border-red-200 dark:border-red-900 flex items-center gap-1.5"><XCircle size={13}/> Anulado</span>;
            default:
                return <span className="bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 px-3 py-1 rounded-full text-xs font-bold border border-amber-200 dark:border-amber-900 flex items-center gap-1.5 animate-pulse"><Clock size={13}/> Em Análise</span>;
        }
    };

    return (
        <div className="space-y-8">
            {/* Action Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4 dark:border-slate-800">
                <div>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                        {requests.length} {requests.length === 1 ? 'pedido submetido' : 'pedidos submetidos'} {isAdmin ? 'no total' : 'por si'}
                    </p>
                </div>
                {!isAdmin && !isFormOpen && (
                    <button onClick={() => setIsFormOpen(true)} className="bg-primary hover:bg-primary/95 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md hover:shadow-lg transition-all text-sm">
                        <Plus size={18} /> Publicar Novo Pedido
                    </button>
                )}
            </div>

            {/* FORMULÁRIO DE NOVO PEDIDO */}
            {isFormOpen && (
                <form onSubmit={handleSubmit} className="bg-white dark:bg-[#0f172a] p-6 sm:p-8 rounded-3xl shadow-md border border-gray-100 dark:border-slate-800 space-y-8 max-w-3xl animate-fade-in">
                    <div className="flex justify-between items-center border-b pb-4 dark:border-slate-800">
                        <h3 className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                            <Package className="text-primary"/> Novo Pedido Personalizado
                        </h3>
                        <button type="button" onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-6">
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Nome do Produto *</label>
                                <input required placeholder="Ex: iPhone 15 Pro Max ou Furadeira Bosch" className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" value={formData.productName} onChange={e => setFormData({...formData, productName: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Categoria *</label>
                                <select required className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})}>
                                    <option value="">Selecione a categoria</option>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Estado Pretendido *</label>
                                <select required className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})}>
                                    <option value="">Selecione o estado ideal</option>
                                    {PRODUCT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Urgência com a entrega *</label>
                                <select required className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" value={formData.urgency} onChange={e => setFormData({...formData, urgency: e.target.value})}>
                                    <option value="">Qual o seu prazo?</option>
                                    {URGENCY_LEVELS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Especificações Técnicas *</label>
                            <textarea required placeholder="Ex: Capacidade 256GB, Cor preta, 16GB RAM, ecran OLED, bateria >90%..." className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" rows={2} value={formData.specifications} onChange={e => setFormData({...formData, specifications: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Outros Detalhes / Observações *</label>
                            <textarea required placeholder="Descreva o que procura no produto, preferências de marca, acessórios incluídos ou finalidade." className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" rows={3} value={formData.details} onChange={e => setFormData({...formData, details: e.target.value})} />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Orçamento Máximo *</label>
                            <div className="relative">
                                <DollarSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input required placeholder="Ex: 800€ ou 300€ - 400€" className="w-full pl-10 pr-4 py-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white font-mono" value={formData.budgetRange} onChange={e => setFormData({...formData, budgetRange: e.target.value})} />
                            </div>
                            <p className="text-[11px] text-gray-500 mt-1 dark:text-slate-400">Proporcione valores adequados para obter ofertas reais e viáveis de fornecedores.</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Link do produto desejado (Opcional)</label>
                            <input placeholder="Cole um link de referência (Amazon, Worten, FNAC, etc.)" className="w-full p-4 rounded-xl border dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white" value={formData.referenceLink} onChange={e => setFormData({...formData, referenceLink: e.target.value})} />
                        </div>

                        {/* Foto de Referência */}
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-slate-400 uppercase mb-2">Imagens de Exemplo / Fotos de Referência (Opcional)</label>
                            <div className="flex flex-wrap items-center gap-4 bg-gray-50 dark:bg-slate-900/40 p-4 rounded-xl border dark:border-slate-800">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 border rounded-lg bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-xs font-bold transition-all text-gray-950 dark:text-white shadow-sm">
                                    <Camera size={16} className="text-primary" /> Adicionar imagem
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                                {isUploading && <Loader2 className="animate-spin text-primary" size={18} />}
                                <div className="flex gap-2 flex-wrap"> 
                                    {photos.map((p, i) => (
                                        <div key={i} className="relative group w-12 h-12 rounded-lg overflow-hidden border">
                                            <img src={p} alt="" className="w-full h-full object-cover" />
                                            <button type="button" onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))} className="absolute inset-0 bg-red-600/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ))} 
                                </div>
                            </div>
                        </div>

                        {/* Push Notifications OPTIONAL - REMOVED REQUIRED ATTRIBUTE */}
                        <div>
                            <label className="flex items-start gap-3 p-4 bg-blue-50/40 dark:bg-blue-950/10 rounded-xl border border-blue-100 dark:border-blue-950/40 cursor-pointer">
                                <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary mt-0.5" checked={formData.notificationsEnabled} onChange={e => setFormData({...formData, notificationsEnabled: e.target.checked})} />
                                <div className="flex flex-col">
                                    <span className="text-xs font-bold text-gray-900 dark:text-white">Receber notificações sobre propostas</span>
                                    <span className="text-[11px] text-gray-500 dark:text-slate-400">Ao marcar esta opção, enviaremos atualizações assim que o seu pedido for aprovado, respondido ou concluído.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t dark:border-slate-800">
                        <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 border rounded-xl font-bold text-sm bg-white dark:bg-slate-800 hover:bg-gray-50 transition-colors">Cancelar</button>
                        <button type="submit" className="px-6 py-3 bg-primary hover:bg-primary/95 text-white rounded-xl font-bold text-sm shadow transition-all">Publicar Pedido</button>
                    </div>
                </form>
            )}

            {/* LISTA DE PEDIDOS */}
            {requests.length === 0 ? (
                <div className="bg-white dark:bg-[#0f172a] p-16 rounded-3xl text-center border dark:border-slate-800 shadow-sm flex flex-col items-center justify-center">
                    <div className="bg-gray-100 dark:bg-slate-800 p-4 rounded-full mb-4">
                        <Package size={36} className="text-gray-400" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Nenhum pedido de produto encontrado</h3>
                    <p className="text-sm text-gray-500 dark:text-slate-400 max-w-sm mx-auto">
                        {isAdmin 
                          ? "Os seus clientes ainda não criaram nenhum pedido personalizado." 
                          : "Ainda não enviou nenhuma solicitação. Crie um pedido para encontrarmos exatamente o produto que procura."}
                    </p>
                    {!isAdmin && (
                        <button onClick={() => setIsFormOpen(true)} className="mt-6 bg-primary text-white px-5 py-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow hover:bg-primary/95">
                            <Plus size={16} /> Fazer Meu Primeiro Pedido
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {requests.map(r => {
                        const isExpanded = expandedId === r.id;
                        const dateFormatted = r.createdAt ? new Date(r.createdAt).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Sem data';
                        
                        // Select border colors based on status
                        let statusColorClasses = "border-l-4 border-l-amber-500";
                        if (r.status === 'Concluído') statusColorClasses = "border-l-4 border-l-emerald-500";
                        if (r.status === 'Anulado') statusColorClasses = "border-l-4 border-l-red-500";

                        return (
                            <div key={r.id} className={`bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-gray-100 dark:border-slate-800/80 overflow-hidden transition-all duration-300 ${statusColorClasses} hover:shadow-md`}>
                                {/* Header (Clickable to expand) */}
                                <div onClick={() => setExpandedId(isExpanded ? null : r.id)} className="p-5 sm:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-slate-900/30 transition-colors">
                                    <div className="space-y-1.5 flex-1 pr-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[10px] font-bold tracking-wider uppercase text-gray-400 dark:text-slate-500">{r.category}</span>
                                            <span className="text-xs text-gray-400 dark:text-slate-500 font-mono">• {dateFormatted}</span>
                                        </div>
                                        <h4 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                            {r.productName}
                                            <span className="text-xs font-normal text-gray-500 dark:text-slate-400 font-mono bg-gray-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">Estado: {r.state}</span>
                                        </h4>
                                    </div>

                                    {/* Action Badges on Right */}
                                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 md:self-center">
                                        {/* Orçamento badge */}
                                        <div className="bg-gray-50 dark:bg-slate-800 px-3 py-1 rounded-full border dark:border-slate-700 flex items-center gap-1">
                                            <DollarSign size={13} className="text-emerald-500 font-bold" />
                                            <span className="text-xs font-mono font-bold text-gray-700 dark:text-slate-300">{r.budgetRange}</span>
                                        </div>
                                        
                                        {/* Urgency Badge */}
                                        {getUrgencyBadge(r.urgency)}

                                        {/* Status Badge */}
                                        {getStatusBadge(r.status)}

                                        {/* Expand Chevron */}
                                        <div className="text-gray-400 hover:text-gray-600 transition-colors pl-2">
                                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Area */}
                                {isExpanded && (
                                    <div className="px-5 pb-6 sm:px-8 border-t dark:border-slate-800 bg-gray-50/30 dark:bg-slate-900/10 pt-6 animate-fade-in space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {/* Details section */}
                                            <div className="space-y-4">
                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase flex items-center gap-1.5 mb-1"><Tag size={12}/> Especificações técnicas</span>
                                                    <p className="text-sm text-gray-800 dark:text-slate-300 bg-white dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800 whitespace-pre-wrap font-mono leading-relaxed">
                                                        {r.specifications}
                                                    </p>
                                                </div>

                                                <div>
                                                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase flex items-center gap-1.5 mb-1"><MessageSquare size={12}/> Descrição Detalhada</span>
                                                    <p className="text-sm text-gray-805 dark:text-slate-300 bg-white dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800 whitespace-pre-wrap leading-relaxed">
                                                        {r.details}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* References & Feedback */}
                                            <div className="space-y-4">
                                                {/* Reference link */}
                                                {r.referenceLink && (
                                                    <div>
                                                        <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1 block">Link de referência</span>
                                                        <a href={r.referenceLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950/20 text-primary border border-blue-100 dark:border-blue-900 px-4 py-3 rounded-xl text-xs font-bold hover:underline">
                                                            <ExternalLink size={14} /> Abrir Link do Exemplo de Produto
                                                        </a>
                                                    </div>
                                                )}

                                                {/* Photo Gallery */}
                                                {r.photos && r.photos.length > 0 && (
                                                    <div>
                                                        <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase mb-1 block">Fotos do produto</span>
                                                        <div className="flex gap-3 flex-wrap bg-white dark:bg-slate-900/60 p-3 rounded-xl border dark:border-slate-800">
                                                            {r.photos.map((photo, pIdx) => (
                                                                <div key={pIdx} onClick={() => setZoomedImage(photo)} className="relative group w-16 h-16 rounded-lg overflow-hidden border dark:border-slate-700 cursor-zoom-in hover:scale-105 transition-transform shadow-xs">
                                                                    <img src={photo} alt="" className="w-full h-full object-cover" />
                                                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                                        <Eye size={14} className="text-white" />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Client / Push Information */}
                                                <div className="bg-white dark:bg-slate-900/50 p-4 rounded-xl border dark:border-slate-800 text-xs text-gray-500 dark:text-slate-400 space-y-2">
                                                    <div className="flex items-center gap-1.5 font-semibold">
                                                        <Bell size={12} className={r.notificationsEnabled ? 'text-green-500' : 'text-gray-400'} />
                                                        <span>Notificações: {r.notificationsEnabled ? 'Ativadas para propostas' : 'Desativadas'}</span>
                                                    </div>
                                                    {isAdmin && (
                                                        <div className="flex items-center gap-1.5 border-t dark:border-slate-800 pt-2 font-mono">
                                                            <User size={12} className="text-gray-400" />
                                                            <span>Cliente: {r.userId} {r.userEmail ? `(${r.userEmail})` : ''}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Existing Admin Response / Proposal */}
                                                {r.adminComment && (
                                                    <div className="space-y-4">
                                                        <div className="bg-emerald-50/60 dark:bg-emerald-950/10 border border-emerald-100 dark:border-emerald-950/40 p-4 rounded-xl space-y-1">
                                                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1">
                                                                <CheckCircle2 size={13}/> Nota da Solução / Proposta Comercial:
                                                            </span>
                                                            <p className="text-sm text-gray-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed font-sans">{r.adminComment}</p>
                                                        </div>

                                                        {/* User Decision UI */}
                                                        {!isAdmin && !r.userDecision && r.status === 'Análise' && (
                                                            <div className="flex flex-col gap-2 p-4 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-xl shadow-sm">
                                                                <p className="text-xs font-bold text-gray-700 dark:text-slate-300">O que achou desta proposta?</p>
                                                                <div className="flex gap-2">
                                                                    <button 
                                                                        onClick={() => handleUserDecision(r.id, 'Aceite')}
                                                                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2"
                                                                    >
                                                                        <CheckCircle2 size={14}/> Aceitar Proposta
                                                                    </button>
                                                                    <button 
                                                                        onClick={() => handleUserDecision(r.id, 'Recusada')}
                                                                        className="flex-1 bg-red-50 dark:bg-red-950/30 text-red-600 hover:bg-red-100 dark:hover:bg-red-950/50 py-2 rounded-lg text-xs font-bold transition-all border border-red-200 dark:border-red-900/50 flex items-center justify-center gap-2"
                                                                    >
                                                                        <XCircle size={14}/> Recusar
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {r.userDecision && (
                                                            <div className={`p-3 rounded-xl text-xs font-bold border flex items-center gap-2 ${
                                                                r.userDecision === 'Aceite' 
                                                                    ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50' 
                                                                    : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900/50'
                                                            }`}>
                                                                {r.userDecision === 'Aceite' ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                                                                Decisão do Cliente: {r.userDecision}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* ADMIN ACTIONS INTERFACE */}
                                        {isAdmin && (
                                            <div className="bg-slate-50 dark:bg-slate-900/80 p-5 rounded-2xl border dark:border-slate-800 space-y-4 pt-4 mt-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1">
                                                        <MessageSquare size={16} className="text-primary"/>
                                                        <h5 className="text-sm font-bold text-gray-800 dark:text-white">Área de Resposta do Administrador (Backoffice)</h5>
                                                    </div>
                                                    {r.userDecision && (
                                                        <span className={`text-[10px] uppercase tracking-wider font-black px-2 py-0.5 rounded ${
                                                            r.userDecision === 'Aceite' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                                                        }`}>
                                                            UTILIZADOR {r.userDecision.toUpperCase()}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <label className="block text-[11px] font-bold text-gray-500 dark:text-slate-400 uppercase">Proposta, Preço, Instruções ou Link Personalizado:</label>
                                                    <textarea 
                                                        placeholder="Ex: Conseguimos o iPhone pretendido por 850€. Envia-nos mensagem no WhatsApp para fechar negócio com desconto de 10€ no frete..."
                                                        className="w-full p-3 rounded-xl border dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-950 dark:text-white"
                                                        rows={3}
                                                        value={adminComments[r.id] || ''}
                                                        onChange={e => setAdminComments({...adminComments, [r.id]: e.target.value})}
                                                    />
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-4 border-t dark:border-slate-800 pt-3">
                                                    <button 
                                                        type="button" 
                                                        onClick={() => saveAdminCommentOnly(r.id)} 
                                                        disabled={isSavingComment[r.id]}
                                                        className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5"
                                                    >
                                                        {isSavingComment[r.id] ? <Loader2 className="animate-spin" size={12}/> : null}
                                                        Guardar Comentário / Proposta
                                                    </button>

                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-400 font-medium">Mudar estado do pedido:</span>
                                                        <button 
                                                            onClick={async () => {
                                                                if(confirm("Pretende marcar este pedido como Concluído / Atendido?")) {
                                                                    await updateStatus(r.id, 'Concluído');
                                                                }
                                                            }} 
                                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                                                        >
                                                            <CheckCircle2 size={13}/> Concluir
                                                        </button>
                                                        <button 
                                                            onClick={async () => {
                                                                if(confirm("Pretende realmente anular e rejeitar este pedido?")) {
                                                                    await updateStatus(r.id, 'Anulado');
                                                                }
                                                            }} 
                                                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                                                        >
                                                            <XCircle size={13}/> Anular
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* FULL SIZE ZOOM MODAL */}
            {zoomedImage && (
                <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" onClick={() => setZoomedImage(null)}>
                    <div className="relative max-w-4xl max-h-[90vh]">
                        <button className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2 text-sm font-semibold flex items-center gap-1 cursor-pointer">
                            <X size={20} /> Fechar
                        </button>
                        <img src={zoomedImage} alt="Zoom" className="max-w-full max-h-[80vh] object-contain rounded-lg border border-white/10 shadow-2xl" />
                    </div>
                </div>
            )}
        </div>
    );
};

export default RequestsTab;
