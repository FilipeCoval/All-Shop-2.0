export const CATALOG_COPY_REVIEW_VERSION = '2026-11-01-v1';

type VariantReview = { description: string; features: string[] };
export type CatalogCopyReview = {
  name?: string;
  category?: string;
  description: string;
  features: string[];
  specs: Record<string, string | boolean>;
  variants?: Record<string, VariantReview>;
};

export const CATALOG_COPY_REVIEW: Record<string, CatalogCopyReview> = {
  '1': {
    category: 'Tv & Streaming',
    description: 'Transforme a televisão num centro de entretenimento 4K com a Xiaomi TV Box S (2.ª Geração). O Google TV reúne filmes, séries e aplicações num só ecrã, enquanto o comando Bluetooth com controlo por voz facilita a pesquisa. Dolby Vision, HDR10+, Dolby Atmos e DTS-HD completam uma experiência de imagem e som envolvente.',
    features: ['4K Ultra HD com Dolby Vision e HDR10+', 'Google TV com Chromecast integrado', 'Dolby Atmos e DTS-HD', 'Comando Bluetooth com pesquisa por voz'],
    specs: { 'Resolução': '4K (3840 × 2160)', 'Processador': 'Quad-Core Cortex-A55', 'Memória': '2 GB RAM', 'Armazenamento': '8 GB', 'Sistema': 'Google TV', 'Conectividade': 'Wi-Fi 2,4/5 GHz e Bluetooth 5.2', 'Portas': 'HDMI 2.1, USB 2.0 e saída de áudio' },
  },
  '2': {
    category: 'Tv & Streaming',
    description: 'Dê uma nova vida a uma televisão com HDMI com a H96 Max M2, uma box multimédia flexível para aplicações, reprodução de conteúdos e utilização diária. O processador Rockchip RK3528, o Wi-Fi 6 e o Android 13 asseguram uma experiência prática, com duas configurações de memória e armazenamento para escolher de acordo com a utilização. Por não ser uma box Google TV certificada, a disponibilidade e a qualidade de algumas aplicações de streaming podem depender da própria aplicação.',
    features: ['Processador Rockchip RK3528 Quad-Core Cortex-A53', 'Reprodução 4K até 60 fps e descodificação 8K até 24/25 fps', 'Wi-Fi 6 e Bluetooth 5.0', 'USB 2.0, USB 3.0, HDMI e ligação de rede'],
    specs: { 'Sistema operativo': 'Android 13', 'Processador': 'Rockchip RK3528 Quad-Core Cortex-A53', 'Saída de vídeo': 'HDMI 2.0b até 4K a 60 fps', 'Conectividade': 'Wi-Fi 6 e Bluetooth 5.0', 'Portas': 'USB 2.0, USB 3.0, HDMI, AV, SPDIF e RJ45' },
    variants: {
      '4 GB RAM + 32 GB': { description: 'A versão com mais memória, indicada para quem pretende instalar mais aplicações e alternar entre elas com maior folga.', features: ['4 GB de memória RAM', '32 GB de armazenamento eMMC'] },
      '2 GB RAM + 16 GB': { description: 'A opção mais económica para reprodução de conteúdos e aplicações essenciais, mantendo as características principais do equipamento.', features: ['2 GB de memória RAM', '16 GB de armazenamento eMMC'] },
    },
  },
  '3': {
    description: 'Cabo HDMI 2.1 para ligar consolas, televisores, monitores e outros equipamentos compatíveis com elevada largura de banda. Suporta imagem até 8K a 60 Hz ou 4K a 120 Hz, bem como eARC e VRR, sendo uma escolha indicada para jogos, cinema e som de alta qualidade. Escolha o comprimento mais adequado à sua instalação.',
    features: ['Largura de banda até 48 Gbps', 'Vídeo até 8K a 60 Hz ou 4K a 120 Hz', 'Compatível com eARC e VRR', 'Conectores reforçados'],
    specs: { 'Norma': 'HDMI 2.1', 'Largura de banda': 'Até 48 Gbps', 'Vídeo': 'Até 8K/60 Hz ou 4K/120 Hz', 'Funções': 'eARC e VRR' },
    variants: {
      '1 Metro': { description: 'Comprimento compacto para equipamentos próximos, evitando excesso de cabo.', features: ['Comprimento de 1 metro', 'Mesmas funções HDMI 2.1'] },
      '2 Metros': { description: 'Comprimento versátil para instalações com maior distância entre os equipamentos.', features: ['Comprimento de 2 metros', 'Mesmas funções HDMI 2.1'] },
    },
  },
  '4': {
    description: 'Melhore a estabilidade da rede com um cabo Ethernet Cat8 de 10 metros, pensado para ligações exigentes em casa ou no trabalho. A blindagem S/FTP ajuda a reduzir interferências e a elevada largura de banda torna-o indicado para gaming, streaming e transferência de ficheiros, sempre condicionado pelos equipamentos ligados.',
    features: ['Velocidade teórica até 40 Gbps', 'Frequência até 2000 MHz', 'Blindagem S/FTP', 'Comprimento de 10 metros'],
    specs: { 'Categoria': 'Cat8', 'Velocidade teórica': 'Até 40 Gbps', 'Frequência': 'Até 2000 MHz', 'Blindagem': 'S/FTP', 'Comprimento': '10 metros', 'Conectores': 'RJ45' },
  },
  '5': {
    category: 'Acessórios',
    description: 'Adicione uma ligação de rede com fios a um computador equipado com USB-A. Este adaptador compacto liga uma porta USB 3.0 a uma entrada Ethernet RJ45, oferecendo uma alternativa prática e estável ao Wi-Fi para trabalho, streaming ou transferência de dados.',
    features: ['Ethernet Gigabit até 1000 Mbps', 'Ligação USB-A 3.0', 'Instalação simples Plug & Play', 'Formato compacto e fácil de transportar'],
    specs: { 'Ligação ao computador': 'USB-A 3.0', 'Saída de rede': 'RJ45', 'Velocidade': 'Até 1000 Mbps', 'Instalação': 'Plug & Play' },
    variants: {
      'Branco': { description: 'A mesma conectividade num acabamento branco discreto.', features: ['Cor branca', 'USB-A 3.0 para RJ45'] },
      'Preto': { description: 'A mesma conectividade num acabamento preto discreto.', features: ['Cor preta', 'USB-A 3.0 para RJ45'] },
    },
  },
  '6': {
    category: 'Tv & Streaming',
    description: 'A Xiaomi TV Box S (3.ª Geração) reúne Google TV, reprodução 4K e 32 GB de armazenamento num equipamento compacto e simples de utilizar. O processador Quad-Core, o Wi-Fi de banda dupla e o comando por voz tornam a navegação mais fluida, enquanto Dolby Vision, HDR10+, Dolby Audio e DTS:X elevam a experiência de imagem e som.',
    features: ['4K a 60 fps com Dolby Vision e HDR10+', 'Google TV com controlo por voz', '32 GB de armazenamento', 'Dolby Audio e DTS:X'],
    specs: { 'Resolução': '4K (3840 × 2160)', 'Processador': 'Quad-Core até 2,5 GHz', 'Memória': '2 GB RAM', 'Armazenamento': '32 GB', 'Sistema': 'Google TV', 'Conectividade': 'Wi-Fi 2,4/5 GHz e Bluetooth 5.2', 'Portas': 'HDMI 2.1 e USB 2.0' },
  },
  '7': {
    description: 'Adaptador de corrente para carregamento rápido, vendido sem cabo e disponível em várias potências. Escolha a versão indicada para o seu equipamento e utilize um cabo compatível com a potência pretendida; a velocidade efetiva depende sempre do dispositivo, do protocolo suportado e do cabo utilizado.',
    features: ['Vendido sem cabo', 'Versões de 33 W, 67 W e 120 W', 'Formato compacto', 'A potência efetiva depende do equipamento e do cabo'],
    specs: { 'Tipo': 'Adaptador de corrente', 'Cabo incluído': 'Não', 'Potências disponíveis': '33 W, 67 W e 120 W', 'Utilização': 'Escolher a versão compatível com o equipamento' },
    variants: {
      '33W Turbo': { description: 'Versão de 33 W para equipamentos compatíveis com esta potência.', features: ['Potência nominal de 33 W', 'Cabo não incluído'] },
      '67W Max': { description: 'Versão de 67 W para equipamentos compatíveis com esta potência.', features: ['Potência nominal de 67 W', 'Cabo não incluído'] },
      '120W Turbo': { description: 'Versão de 120 W para equipamentos compatíveis com esta potência.', features: ['Potência nominal de 120 W', 'Cabo não incluído'] },
    },
  },
  '8': {
    description: 'Kit de carregamento Xiaomi com adaptador e cabo compatível, disponível em várias potências para diferentes telemóveis e equipamentos. Selecione a potência correspondente ao seu dispositivo para obter o melhor desempenho possível; a velocidade final depende do modelo, do protocolo suportado e das condições de utilização.',
    features: ['Kit com adaptador e cabo', 'Várias potências disponíveis', 'Proteções de carregamento integradas', 'Compatível com modelos Xiaomi, Redmi e POCO adequados'],
    specs: { 'Conteúdo': 'Adaptador e cabo de carregamento', 'Conector do cabo': 'USB-A para USB-C', 'Potências disponíveis': 'Conforme a opção escolhida', 'Compatibilidade': 'Depende do modelo e do protocolo suportado' },
    variants: {
      '120W HyperCharge Combo': { description: 'Kit de 120 W para modelos compatíveis com Xiaomi HyperCharge.', features: ['Potência nominal de 120 W', 'Adaptador e cabo incluídos'] },
      '45W  HyperCharge Combo': { description: 'Kit de 45 W para modelos compatíveis com esta potência.', features: ['Potência nominal de 45 W', 'Adaptador e cabo incluídos'] },
      '67W HyperCharge Combo': { description: 'Kit de 67 W para modelos compatíveis com Xiaomi HyperCharge.', features: ['Potência nominal de 67 W', 'Adaptador e cabo incluídos'] },
      '90W HyperCharge Combo': { description: 'Kit de 90 W para modelos compatíveis com Xiaomi HyperCharge.', features: ['Potência nominal de 90 W', 'Adaptador e cabo incluídos'] },
      '33w turbo': { description: 'Kit de 33 W para modelos compatíveis com esta potência.', features: ['Potência nominal de 33 W', 'Adaptador e cabo incluídos'] },
      '67w max': { description: 'Kit de 67 W para modelos compatíveis com esta potência.', features: ['Potência nominal de 67 W', 'Adaptador e cabo incluídos'] },
      '33W HyperCharge Combo': { description: 'Kit de 33 W para modelos compatíveis com Xiaomi HyperCharge.', features: ['Potência nominal de 33 W', 'Adaptador e cabo incluídos'] },
    },
  },
  '9': {
    description: 'Cabo de carregamento de 2 metros para utilização diária com smartphones, tablets, powerbanks e outros equipamentos USB-C. Está disponível com ligação USB-A ou USB-C na extremidade do carregador, permitindo escolher a opção adequada às portas que já utiliza.',
    features: ['Comprimento de 2 metros', 'Carregamento e transferência de dados', 'Conector USB-C no equipamento', 'Escolha entre USB-A ou USB-C no carregador'],
    specs: { 'Comprimento': '2 metros', 'Ligação ao equipamento': 'USB-C', 'Funções': 'Carregamento e transferência de dados', 'Ligação ao carregador': 'Conforme a opção escolhida' },
    variants: {
      'USB C para USB C 2M': { description: 'Para carregadores e computadores com porta USB-C.', features: ['USB-C para USB-C', 'Comprimento de 2 metros'] },
      'USB A para USB C 2M': { description: 'Para carregadores e computadores com porta USB-A tradicional.', features: ['USB-A para USB-C', 'Comprimento de 2 metros'] },
    },
  },
  '13': {
    category: 'Acessórios',
    description: 'Tapete de secretária XL com superfície ampla para rato e teclado, ideal para criar uma zona de trabalho ou gaming mais organizada. A base de borracha ajuda a mantê-lo estável e as bordas reforçadas aumentam a resistência ao uso diário. Escolha o design que melhor combina com o seu espaço.',
    features: ['Formato XL de 900 × 400 mm', 'Base de borracha antiderrapante', 'Superfície adequada a movimentos precisos', 'Bordas reforçadas'],
    specs: { 'Dimensões': '900 × 400 × 2 mm', 'Base': 'Borracha antiderrapante', 'Bordas': 'Reforçadas', 'Design': 'Conforme a opção escolhida' },
    variants: {
      'Design Branco Clássico (V1)': { description: 'Versão com o design branco clássico Sports Car.', features: ['Design Branco Clássico V1', 'Dimensões 900 × 400 mm'] },
      'Design Futurista (V2)': { description: 'Versão com o design futurista Sports Car.', features: ['Design Futurista V2', 'Dimensões 900 × 400 mm'] },
    },
  },
  '16': {
    category: 'Áudio',
    description: 'Auriculares TWS leves para música, chamadas e utilização diária, com ligação Bluetooth 5.0 e controlos táteis. O formato compacto e o estojo de carregamento tornam-nos fáceis de transportar. Algumas unidades podem apresentar a marca thinkplus, pertencente ao ecossistema Lenovo, sem alterar a versão selecionada.',
    features: ['Bluetooth 5.0', 'Controlos táteis', 'Carregamento por USB-C', 'Design leve e compacto'],
    specs: { 'Tipo': 'Auriculares TWS', 'Bluetooth': '5.0', 'Carregamento': 'USB-C', 'Controlos': 'Táteis', 'Cor': 'Conforme a opção escolhida' },
    variants: {
      'Preto': { description: 'Auriculares e estojo em acabamento preto.', features: ['Cor preta', 'Mesmas funções e autonomia da gama'] },
      'Branco': { description: 'Auriculares e estojo em acabamento branco.', features: ['Cor branca', 'Mesmas funções e autonomia da gama'] },
    },
  },
  '17': {
    category: 'Áudio',
    description: 'Os Redmi Buds 6 Play combinam um formato leve e confortável com Bluetooth 5.4 para música e chamadas no dia a dia. Cada auricular oferece até 7,5 horas de reprodução e o estojo prolonga a autonomia total até 36 horas. A redução de ruído por inteligência artificial ajuda a tornar a voz mais nítida durante as chamadas.',
    features: ['Bluetooth 5.4', 'Até 7,5 horas por carga e 36 horas com o estojo', 'Driver dinâmico de 10 mm', 'Redução de ruído por IA em chamadas'],
    specs: { 'Bluetooth': '5.4', 'Autonomia dos auriculares': 'Até 7,5 horas', 'Autonomia com estojo': 'Até 36 horas', 'Driver': '10 mm', 'Carregamento': 'USB-C', 'Peso total': '40 g' },
    variants: {
      'Preto': { description: 'Auriculares Redmi Buds 6 Play em preto.', features: ['Cor preta', 'Bluetooth 5.4 e até 36 horas com estojo'] },
      'Branco': { description: 'Auriculares Redmi Buds 6 Play em branco.', features: ['Cor branca', 'Bluetooth 5.4 e até 36 horas com estojo'] },
    },
  },
  '1769876342618': {
    category: 'Áudio',
    description: 'Os REDMI Buds 8 Lite juntam cancelamento ativo de ruído até 42 dB, som detalhado e um formato confortável para acompanhar o dia inteiro. O driver de 12,4 mm, os microfones duplos para chamadas e a aplicação Xiaomi Earbuds permitem adaptar a experiência, enquanto o estojo oferece até 36 horas de reprodução total.',
    features: ['Cancelamento ativo de ruído até 42 dB', 'Driver de 12,4 mm com diafragma de titânio', 'Até 8 horas por carga e 36 horas com estojo', 'Bluetooth 5.4 e equalização personalizável'],
    specs: { 'Bluetooth': '5.4', 'Cancelamento de ruído': 'ANC até 42 dB', 'Driver': '12,4 mm', 'Autonomia dos auriculares': 'Até 8 horas', 'Autonomia com estojo': 'Até 36 horas', 'Carregamento': 'USB-C' },
    variants: {
      'Preto': { description: 'REDMI Buds 8 Lite em acabamento preto.', features: ['Cor preta', 'ANC até 42 dB e até 36 horas com estojo'] },
      'Branco': { description: 'REDMI Buds 8 Lite em acabamento branco.', features: ['Cor branca', 'ANC até 42 dB e até 36 horas com estojo'] },
    },
  },
  '1776348120437': {
    name: 'Cabo de rede Vention Cat6 UTP',
    description: 'Cabo de rede Vention Cat6 UTP para ligar computadores, consolas, televisores, routers e outros equipamentos com porta Ethernet. Proporciona uma ligação por cabo estável para trabalho, gaming ou streaming e está disponível em vários comprimentos para evitar extensões desnecessárias.',
    features: ['Categoria 6 para redes Ethernet', 'Construção UTP flexível', 'Conectores RJ45', 'Comprimentos de 5, 8 e 10 metros'],
    specs: { 'Categoria': 'Cat6', 'Construção': 'UTP', 'Conectores': 'RJ45', 'Comprimento': 'Conforme a opção escolhida' },
    variants: {
      '10M': { description: 'A opção mais longa para divisões ou equipamentos mais afastados.', features: ['Comprimento de 10 metros', 'Conectores RJ45'] },
      '5M': { description: 'Comprimento equilibrado para ligações domésticas e de escritório.', features: ['Comprimento de 5 metros', 'Conectores RJ45'] },
      '8M': { description: 'Comprimento intermédio para percursos maiores sem excesso de cabo.', features: ['Comprimento de 8 metros', 'Conectores RJ45'] },
    },
  },
  '1776451648679': {
    category: 'Áudio',
    description: 'Os REDMI Buds 8 Active foram concebidos para uma utilização confortável ao longo do dia, com um formato leve e Bluetooth 5.4. O driver dinâmico de 14,2 mm oferece som amplo e os microfones com redução de ruído por IA ajudam nas chamadas. A autonomia chega às 7 horas por carga e às 37 horas com o estojo.',
    features: ['Driver dinâmico de 14,2 mm', 'Bluetooth 5.4', 'Até 7 horas por carga e 37 horas com o estojo', 'Redução de ruído por IA em chamadas'],
    specs: { 'Bluetooth': '5.4', 'Driver': '14,2 mm', 'Autonomia dos auriculares': 'Até 7 horas', 'Autonomia com estojo': 'Até 37 horas', 'Carregamento': 'USB-C', 'Peso total': '35,6 g' },
    variants: {
      'Branco': { description: 'REDMI Buds 8 Active em acabamento branco.', features: ['Cor branca', 'Bluetooth 5.4 e até 37 horas com estojo'] },
      'Preto': { description: 'REDMI Buds 8 Active em acabamento preto.', features: ['Cor preta', 'Bluetooth 5.4 e até 37 horas com estojo'] },
    },
  },
  '1777119702513': {
    description: 'Cabo de carregamento com revestimento em nylon trançado e conectores reforçados, preparado para a utilização diária em casa, no trabalho ou em viagem. Escolha a combinação de conectores e a cor adequada ao seu equipamento. A velocidade de carregamento depende sempre do carregador e do dispositivo ligados.',
    features: ['Revestimento em nylon trançado', 'Conectores reforçados', 'Carregamento e transferência de dados', 'Várias combinações de conectores e cores'],
    specs: { 'Revestimento': 'Nylon trançado', 'Funções': 'Carregamento e transferência de dados', 'Conectores': 'Conforme a opção escolhida', 'Cor': 'Conforme a opção escolhida' },
    variants: {
      'USB-A para USB-C | Preto': { description: 'Cabo preto com ligação USB-A para USB-C.', features: ['USB-A para USB-C', 'Revestimento preto em nylon'] },
      'USB-A para Lightning | Vermelho': { description: 'Cabo vermelho com ligação USB-A para Lightning.', features: ['USB-A para Lightning', 'Revestimento vermelho em nylon'] },
      'USB-C para USB-C | Preto': { description: 'Cabo preto com ligação USB-C nas duas extremidades.', features: ['USB-C para USB-C', 'Revestimento preto em nylon'] },
      'USB-A para Lightning | Preto': { description: 'Cabo preto com ligação USB-A para Lightning.', features: ['USB-A para Lightning', 'Revestimento preto em nylon'] },
      'USB-C para USB-C | Vermelho': { description: 'Cabo vermelho com ligação USB-C nas duas extremidades.', features: ['USB-C para USB-C', 'Revestimento vermelho em nylon'] },
    },
  },
  '1777141219448': {
    category: 'Acessórios',
    description: 'Powerbank ultrafina com corpo em liga de alumínio, pensada para transportar energia extra sem ocupar demasiado espaço. Está disponível em duas capacidades e combina carregamento por cabo com carregamento sem fios para equipamentos compatíveis. Escolha a capacidade de acordo com a autonomia e o peso que pretende levar consigo.',
    features: ['Corpo fino em liga de alumínio', 'Carregamento por cabo e sem fios', 'Versões de 5000 mAh e 10000 mAh', 'Formato portátil para utilização diária'],
    specs: { 'Material': 'Liga de alumínio', 'Carregamento': 'Por cabo e sem fios', 'Capacidade': 'Conforme a opção escolhida', 'Espessura anunciada': '7,8 mm' },
    variants: {
      '5000 mAh': { description: 'Versão mais leve e compacta para reforços de energia ao longo do dia.', features: ['Capacidade de 5000 mAh', 'Menor volume para transportar'] },
      '10000 mAh': { description: 'Versão com maior capacidade para mais autonomia entre carregamentos.', features: ['Capacidade de 10000 mAh', 'Maior reserva de energia'] },
    },
  },
  '1779111942975': {
    category: 'Tv & Streaming',
    description: 'Transforme qualquer televisão com HDMI num centro de entretenimento compacto com o Xiaomi TV Stick 4K (2.ª Geração). O Google TV reúne conteúdos e aplicações, o processador Cortex-A55 e o Wi-Fi de banda dupla asseguram uma utilização fluida, e o suporte para Dolby Vision, HDR10+, Dolby Atmos e DTS:X melhora a experiência de imagem e som.',
    features: ['4K com Dolby Vision e HDR10+', 'Google TV com aplicações populares', 'Dolby Atmos e DTS:X', 'Formato compacto e portátil'],
    specs: { 'Resolução': '4K', 'Processador': 'Quad-Core Cortex-A55', 'Memória': '2 GB RAM', 'Armazenamento': '8 GB', 'Sistema': 'Google TV', 'Conectividade': 'Wi-Fi 2,4/5 GHz e Bluetooth 5.2', 'Portas': 'HDMI e Micro USB' },
  },
  '1781809089923': {
    name: 'Kit de acessórios para Xiaomi Robot Vacuum X20+ / X20 Plus',
    category: 'Acessórios',
    description: 'Conjunto de consumíveis de substituição para ajudar a manter o Xiaomi Robot Vacuum X20+ / X20 Plus em boas condições de limpeza. Reúne acessórios para manutenção periódica e permite ter peças de reserva prontas quando as anteriores estiverem gastas. Antes da compra, confirme sempre o modelo exato do seu robot aspirador.',
    features: ['Kit de consumíveis de substituição', 'Compatível com Xiaomi Robot Vacuum X20+ / X20 Plus', 'Pensado para manutenção periódica', 'Confirmação do modelo recomendada antes da compra'],
    specs: { 'Tipo': 'Kit de acessórios e consumíveis', 'Compatibilidade': 'Xiaomi Robot Vacuum X20+ / X20 Plus', 'Utilização': 'Manutenção e substituição periódica' },
  },
};
