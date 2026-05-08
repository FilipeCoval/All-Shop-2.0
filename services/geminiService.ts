
import { GoogleGenAI } from "@google/genai";
import { STORE_NAME, BOT_NAME } from '../constants';
import { InventoryProduct, Product, SupportTicket, Order, OrderItem } from '../types';
import { db } from './firebaseConfig';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let chatHistory: any[] = [];

const getSystemInstruction = (products: Product[], userOrders: Order[] = []): string => {
  const productsList = products.map(p => 
    `- **${p.name}** (€ ${p.price.toFixed(2)})${p.variants ? ' [Várias Opções/Variantes Disponíveis]' : ''}${p.comingSoon ? ' [PRODUTO EM BREVE - Brevemente no Stock]' : ''}\n  Categoria: ${p.category}\n  Descrição: ${p.description}\n  Specs: ${p.features.join(', ')}`
  ).join('\n\n');

  let ordersContext = "O cliente ainda não tem compras registadas ou não fez login.";
  if (userOrders.length > 0) {
      ordersContext = userOrders.map(o => 
        `- Encomenda #${o.id} (${new Date(o.date).toLocaleDateString()}): Status [${o.status}]. Itens: ${formatOrderItems(o.items)}`
      ).join('\n');
  }

  return `
Atue como a **${BOT_NAME}**, a assistente virtual inteligente e especialista de tecnologia da loja **${STORE_NAME}**.
Você é do sexo feminino, simpática, eficiente e tem um tom de voz acolhedor mas profissional.

**SUA MISSÃO:**
1. **Vendas:** Ajudar clientes a escolher o melhor produto, explicando as diferenças técnicas de forma simples.
2. **Suporte:** Ajudar clientes com problemas técnicos (Pós-venda).

**CONTEXTO DO CLIENTE (HISTÓRICO DE COMPRAS):**
${ordersContext}

**REGRAS DE SUPORTE (Garantias/Devoluções/Avarias):**
1. **Validação de Compra (CRÍTICO):** Se o cliente reclamar de um produto, VERIFIQUE no "Histórico de Compras" acima se ele realmente comprou esse item connosco.
   - Se a compra NÃO estiver na lista: Pergunte educadamente pelo número da encomenda ou se comprou com outro email. Diga: "Não estou a encontrar registo dessa compra na sua conta atual. Pode fornecer o número do pedido?".
   - Se a compra estiver na lista: Avance para a triagem técnica.
2. **Triagem Primeiro:** Se o cliente disser "não funciona", NÃO crie ticket logo. Pergunte: "O que acontece exatamente?", "Acende alguma luz?", "Já reiniciou?". Tente resolver.
3. **Criação de Ticket:** Se o problema persistir E a compra for verificada, diga: "Vou abrir um processo de suporte técnico.".
4. **Dados:** Peça o Email e Nome (se ainda não tiver). O ID da encomenda é OBRIGATÓRIO para garantias.
5. **Ação:** Use a ferramenta **'createSupportTicket'** para registar o problema.

Responda sempre em Português de Portugal. Use emojis ocasionalmente para ser expressiva 😊.

**📦 CATÁLOGO ATUALIZADO (Use apenas estes dados para recomendações):**
${productsList}
`;
}

// Format order items
const formatOrderItems = (items: (OrderItem | string)[]): string => {
    if (!items) return "";
    return items.map(i => {
        if (typeof i === 'string') return i;
        return `${i.quantity}x ${i.name} ${i.selectedVariant ? `(${i.selectedVariant})` : ''}`;
    }).join(', ');
};

// Recebe os produtos para garantir que a IA sabe do que está a falar
export const sendMessageToGemini = async (message: string, currentProducts: Product[], userOrders: Order[] = []): Promise<string> => {
  try {
    const formattedHistory = chatHistory.map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: Array.isArray(msg.parts) ? msg.parts : [{ text: msg.parts }]
    }));

    const result = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            ...formattedHistory,
            {
                role: 'user',
                parts: [{ text: message }]
            }
        ],
        config: {
            systemInstruction: getSystemInstruction(currentProducts, userOrders)
        }
    });

    const reply = result.text || "Pode repetir?";
    
    // Simplistic history tracking
    chatHistory.push({ role: 'user', parts: [{ text: message }] });
    chatHistory.push({ role: 'model', parts: [{ text: reply }] });

    return reply;
  } catch (error) {
    console.error(error);
    return "Tive um pequeno lapso. Pode repetir a pergunta?";
  }
};

export const getInventoryAnalysis = async (products: InventoryProduct[], userPrompt: string): Promise<string> => {
    try {
        const inventoryContext = products
            .filter((p: any) => (p.quantityBought - p.quantitySold) > 0)
            .map((p: any) => {
              const remaining = p.quantityBought - p.quantitySold;
              const profit = (p.salePrice - p.purchasePrice) * remaining;
              return `- ${p.name} (${p.variant || 'Padrão'}): ${remaining} unidades em stock. Custo unitário: ${p.purchasePrice.toFixed(2)}€. Preço de venda: ${p.salePrice.toFixed(2)}€. Lucro potencial total neste lote: ${profit.toFixed(2)}€.`;
            })
            .join('\n');
      
          const prompt = `
            Você é um consultor estratégico de e-commerce para a loja All-Shop.
            O seu objetivo é analisar o inventário atual e fornecer conselhos práticos e criativos para maximizar o lucro e movimentar o stock.
            
            INVENTÁRIO ATUAL (APENAS PRODUTOS COM STOCK):
            ${inventoryContext}
            
            PEDIDO DO GESTOR: "${userPrompt}"
            
            As suas respostas devem ser:
            - Em Português de Portugal.
            - Diretas, práticas e focadas em ações.
            - Sugira bundles (combos de produtos), promoções específicas ("leve X pague Y"), ou destaque os produtos com maior margem de lucro.
            - Use **negrito** para destacar produtos ou ações chave.
            - Mantenha um tom profissional mas encorajador.
          `;

        const result = await ai.models.generateContent({ 
           model: 'gemini-2.5-pro',
           contents: prompt 
        });

        return result.text || "Não foi possível gerar uma análise. Tente ser mais específico.";
    } catch (e) {
        console.error("Gemini Analysis Error:", e);
        return "Ocorreu um erro ao comunicar com o serviço de IA. Verifique a consola para mais detalhes.";
    }
};

/**
 * Extrai o Número de Série (S/N) ou Código de Barras de uma imagem Base64.
 * Ideal para etiquetas difíceis (Xiaomi, alta densidade, reflexos).
 */
export const extractSerialNumberFromImage = async (base64Image: string): Promise<string | null> => {
    try {
        let cleanBase64 = base64Image;
        let mimeType = 'image/jpeg';
        if (typeof base64Image === 'string' && base64Image.includes('base64,')) {
            const prefix = base64Image.split('base64,')[0];
            const match = prefix.match(/data:(.*?);/);
            if (match && match[1]) {
                mimeType = match[1];
            }
            cleanBase64 = base64Image.split('base64,')[1];
        }

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      data: cleanBase64,
                      mimeType
                    }
                  },
                  {
                    text: `Encontre e extraia o número de série (S/N) ou código principal desta etiqueta. 
                    REGRAS ESTRITAS: 
                    - Procure por padrões como S/N, SN, Serial No. 
                    - Ignore IMEI, MAC address, PN (Part Number) ou EAN (códigos só de barras normais).
                    - Retorne APENAS os caracteres do código, sem espaços ou rótulos.
                    - Caso não encontre de todo, retorne apenas: NOT_FOUND`
                  }
                ]
              }
            ]
        });

        const text = result.text?.trim();
        if (!text || text.includes('NOT_FOUND')) return null;
        
        // Limpeza extra para garantir que só vem o código
        return text.replace(/[^a-zA-Z0-9\-\/]/g, '');
    } catch (error) {
        console.error("Gemini OCR Error:", error);
        throw error;
    }
};

// --- NOVA FUNÇÃO: Gerador de Conteúdo para Produtos ---
export const generateProductContent = async (name: string, category: string): Promise<{ description: string, features: string[] } | null> => {
    try {
        const prompt = `
            Crie uma descrição comercial atrativa e concisa (máx 3 parágrafos) e uma lista de 4-6 características principais para o seguinte produto.
            
            Produto: ${name}
            Categoria: ${category}
            
            Retorna o resultado ESTRITAMENTE num formato JSON com a seguinte estrutura, sem markdown extra ou backticks (\`\`\`json):
            {
              "description": "Texto da descrição aqui...",
              "features": ["Característica 1", "Característica 2", "Característica 3"]
            }
          `;
      
        const result = await ai.models.generateContent({ 
            model: 'gemini-2.5-flash',
            contents: prompt 
        });

        const jsonText = result.text;
        if (!jsonText) return null;
        
        // Limpar possíveis backticks de markdown
        const cleanedJson = jsonText.replace(/```(?:json)?\n?|\n?```/g, '').trim();
        
        return JSON.parse(cleanedJson);
    } catch (e) {
        console.error("Gemini Content Gen Error:", e);
        return null;
    }
};

