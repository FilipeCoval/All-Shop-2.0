import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, doc, setDoc } from 'firebase/firestore';
import rawConfig from './firebase-applet-config.json' with { type: 'json' };

const firebaseConfig = {
  apiKey: rawConfig.apiKey,
  authDomain: rawConfig.authDomain,
  projectId: rawConfig.projectId,
  storageBucket: rawConfig.storageBucket,
  messagingSenderId: rawConfig.messagingSenderId,
  appId: rawConfig.appId,
};

const app = initializeApp(firebaseConfig);
const dbId = "ai-studio-eb96f82b-d857-4490-a008-e26d5f5acdb9";
const db = getFirestore(app, dbId);

const INITIAL_PRODUCTS = [
    {
        id: 6,
        name: "TV Stick 4K Ultra HD (Google TV)",
        category: "TV & Streaming",
        price: 38.99,
        originalPrice: 49.99,
        promoEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        image: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&q=80",
        description: "Transforma a tua TV numa Smart TV com o melhor sistema operativo do mercado. Suporte para Netflix, Disney+, YouTube e muito mais em 4K real.",
        stock: 45,
        features: ["4K HDR 60fps", "Comando com Google Assistant", "Dolby Atmos", "Instalação Instantânea"],
        isPremium: true,
        premiumData: {
            heroTitle: "TV Stick 4K Ultra",
            heroSubtitle: "O seu cinema em casa, agora mais inteligente.",
            heroImage: "https://images.unsplash.com/photo-1542382257-80dedb725088?auto=format&fit=crop&q=80",
            heroTextColor: "#ffffff",
            heroAlign: "center",
            showBuyButton: true,
            blocks: [
                {
                    id: "b1",
                    type: "rectangle",
                    title: "Poder Infinito",
                    description: "Processador quad-core de alta performance para uma fluidez sem precedentes.",
                    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80",
                    textColor: "#ffffff",
                    textAlign: "left",
                    textVerticalAlign: "center"
                },
                {
                    id: "b2",
                    type: "square",
                    title: "Google TV",
                    description: "Recomendações personalizadas para toda a família.",
                    image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&q=80",
                    textColor: "#ffffff",
                    textAlign: "center",
                    textVerticalAlign: "bottom"
                }
            ]
        }
    },
    {
        id: 1,
        name: "Auscultadores Wireless Pro Noise Cancelling",
        category: "Audio",
        price: 79.90,
        originalPrice: 119.00,
        image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80",
        description: "Som imersivo com cancelamento de ruído ativo. Perfeito para viagens e foco total no trabalho.",
        stock: 12,
        features: ["ANC Ativo", "40 Horas de Bateria", "Bluetooth 5.3", "Microfones HD"],
        isPremium: true
    },
    {
        id: 8,
        name: "Sony WH-1000XM5 Silver Edition",
        category: "Audio",
        price: 329.00,
        image: "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&q=80",
        description: "O melhor cancelamento de ruído do mundo. Qualidade de som excepcional que define o padrão da indústria.",
        stock: 8,
        features: ["Auto NC Optimizer", "Speak-to-Chat", "30 Horas de Bateria"],
        isPremium: true
    },
    {
        id: 2,
        name: "Cabo HDMI 2.1 8K Ultra High Speed (2m)",
        category: "Cabos",
        price: 12.50,
        image: "https://images.unsplash.com/photo-1538370965046-79c0d6907d47?auto=format&fit=crop&q=80",
        description: "Cabo blindado de alta qualidade para gaming e cinema em casa. Suporta 120Hz em 4K e 60Hz em 8K.",
        stock: 150,
        features: ["48 Gbps", "eARC Suporte", "Dynamic HDR"],
        isPremium: false
    },
    {
        id: 3,
        name: "Carregador GaN 65W Turbo (3 portas)",
        category: "Carregadores",
        price: 29.90,
        image: "https://images.unsplash.com/photo-1610940882244-596623063f6c?auto=format&fit=crop&q=80",
        description: "Carregue o seu portátil, tablet e telemóvel ao mesmo tempo com o máximo de eficiência e tamanho reduzido.",
        stock: 30,
        features: ["Tecnologia GaN", "2x USB-C + 1x USB-A", "Proteção Inteligente"],
        isPremium: false
    },
    {
        id: 4,
        name: "Adaptador USB-C Hub 7-em-1",
        category: "Adaptadores",
        price: 34.50,
        image: "https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80",
        description: "Expanda as portas do seu MacBook ou portátil com HDMI, USB 3.0 e leitores de cartões.",
        stock: 20,
        features: ["HDMI 4K", "Power Delivery 100W", "Slot SD/TF"],
        isPremium: false
    },
    {
        id: 5,
        name: "Smartwatch Ultra Fit Series S",
        category: "Acessórios",
        price: 54.90,
        image: "https://images.unsplash.com/photo-1508685096489-0d85a17400d4?auto=format&fit=crop&q=80",
        description: "Monitore a sua saúde, receba notificações e controle o seu treino com este smartwatch elegante.",
        stock: 15,
        features: ["Ecrã AMOLED", "GPS Integrado", "Resistente à Água IP68"],
        isPremium: false
    },
    {
        id: 7,
        name: "Comando Wireless Multi-Platform G3",
        category: "Gaming",
        price: 44.90,
        image: "https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&q=80",
        description: "Comando ergonómico compatível com PC, Switch e Android. Baixa latência e feedback tátil.",
        stock: 25,
        features: ["Bateria Recarregável", "Botões Programáveis", "Gyro 6-Eixos"],
        isPremium: false
    },
    {
        id: 9,
        name: "Logitech G Pro X Superlight",
        category: "Gaming",
        price: 139.90,
        image: "https://images.unsplash.com/photo-1527690718360-394200472494?auto=format&fit=crop&q=80",
        description: "Rato gaming ultraleve para competitividade máxima. Menos de 63 gramas e sensor HERO 25K.",
        stock: 10,
        features: ["Lightspeed Wireless", "Pés em PTFE", "Click Tátil"],
        isPremium: false
    },
    {
        id: 10,
        name: "Cabo USB-C para USB-C 100W (5A)",
        category: "Cabos",
        price: 9.90,
        image: "https://images.unsplash.com/photo-1589156229687-496a31ad1d1f?auto=format&fit=crop&q=80",
        description: "Cabo de alta resistência com suporte para carregamento ultra-rápido de portáteis e smartphones.",
        stock: 200,
        features: ["E-Marker Chip", "480 Mbps Transferência", "Nylon Trançado"],
        isPremium: false
    }
];

const INITIAL_REVIEWS = [
    {
        id: "rev-101",
        productId: 6,
        userName: "Carlos Santos",
        rating: 5,
        comment: "Excelente box! Super rápida e o Google TV é muito melhor que o sistema original da minha televisão. Recomendo vivamente.",
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "rev-102",
        productId: 6,
        userName: "Maria Oliveira",
        rating: 5,
        comment: "Trabalho impecável da All-Shop. Encomendei num dia, recebi no outro. O produto funciona perfeitamente.",
        date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "rev-103",
        productId: 1,
        userName: "Ricardo Pereira",
        rating: 4,
        comment: "Som muito bom pelo preço. O cancelamento de ruído é eficaz.",
        date: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
        id: "rev-104",
        productId: 8,
        userName: "Ana Silva",
        rating: 5,
        comment: "Os melhores auscultadores que já tive. O cancelamento de ruído é mágico no avião.",
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    }
];

async function seed() {
    console.log("Seeding comprehensive data to:", dbId);
    
    // Seed products_public
    for (const p of INITIAL_PRODUCTS) {
        await setDoc(doc(db, 'products_public', p.id.toString()), p);
        console.log(`Seeded public product: ${p.name}`);
        
        // Seed products_inventory
        await setDoc(doc(db, 'products_inventory', p.id.toString()), {
            publicProductId: p.id,
            name: p.name,
            quantityBought: p.stock,
            quantitySold: 0,
            reserved: 0,
            units: Array.from({length: p.stock}, (_, i) => ({
                id: `SN-${p.id}-${1000 + i}`,
                status: 'AVAILABLE'
            }))
        });
    }

    // Seed reviews
    for (const r of INITIAL_REVIEWS) {
        await setDoc(doc(db, 'reviews', r.id), r);
        console.log(`Seeded review for product ${r.productId}`);
    }

    // Seed store_categories
    const categories = [
        { name: 'TV & Streaming', image: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&q=80', order: 1 },
        { name: 'Audio', image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80', order: 2 },
        { name: 'Gaming', image: 'https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&q=80', order: 3 },
        { name: 'Cabos', image: 'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?auto=format&fit=crop&q=80', order: 4 },
        { name: 'Carregadores', image: 'https://images.unsplash.com/photo-1610940882244-596623063f6c?auto=format&fit=crop&q=80', order: 5 },
        { name: 'Adaptadores', image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80', order: 6 },
        { name: 'Acessórios', image: 'https://images.unsplash.com/photo-1508685096489-7ds9a17400d4?auto=format&fit=crop&q=80', order: 7 }
    ];
    
    // Clear old categories first to avoid duplicates if possible, or just overwrite by name?
    // Firestore addDoc generates random IDs, better to use setDoc with name-based IDs for categories to avoid duplicates on re-seed.
    for (const cat of categories) {
        const catId = cat.name.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
        await setDoc(doc(db, 'store_categories', catId), cat);
    }
    console.log("Seeded categories.");

    process.exit(0);
}

seed().catch(console.error);
