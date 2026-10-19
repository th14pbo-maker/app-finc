# 💰 Finance OS Local

> **Seu dinheiro, com clareza.** Um sistema financeiro pessoal completo, moderno e 100% privado — sem mensalidades, sem conexão bancária externa obrigatória e sem dependências pesadas.

---

## ⚡ Destaques & Diferenciais

- 🔒 **100% Privado & Local-First:** Seus dados financeiros pertencem a você e ficam armazenados com segurança no seu navegador via `localStorage`.
- 🚀 **Zero Dependências Externas:** Funciona nativamente com JavaScript puro (ES Modules) e pode ser executado localmente via **Node.js** ou **Python 3** nativos, sem necessidade de `npm install` ou `pip install`.
- 📱 **PWA & Mobile Ready:** Instalável como aplicativo nativo no celular (iOS/Android) ou computador (Chrome/Edge/Safari), com navegação inferior intuitiva e suporte offline via Service Worker.
- 🎨 **Design Moderno & Acessível:** Interface refinada com suporte a **Modo Escuro / Claro**, gráficos dinâmicos de fluxo (linha, barra e pizza) e modo de privacidade ("ocultar valores").
- 💳 **Gestão Completa:**
  - **Contas & Carteiras:** Saldo consolidado, saldo inicial e conciliação manual.
  - **Cartões de Crédito:** Controle de limite, dias de fechamento/vencimento e pagamento de fatura.
  - **Transações:** Categorias macro, prioridades (*Essencial, Bem-estar, Extra*), hashtags e observações detalhadas.
  - **Metas & Planejamento:** Cálculo de aporte mensal sugerido, barras de progresso e histórico de aportes.
  - **Backups JSON & CSV:** Exportação e restauração completa a qualquer momento.

---

## 📂 Estrutura de Pastas do Projeto

```
Finance-OS-Local/
├── 📄 package.json              # Configurações de scripts npm (start, dev)
├── 📄 server.mjs                # Servidor local Node.js (zero dependências)
├── 📄 iniciar.py                # Servidor local Python 3 (padrão standard library)
├── ⚙️ Iniciar-Windows.bat        # Inicializador inteligente para Windows (Python ou Node)
├── ⚙️ Iniciar-Mac-Linux.command  # Inicializador para macOS e Linux
├── 📄 vercel.json               # Configuração para deploy instantâneo na Vercel
├── 📄 netlify.toml              # Configuração para deploy instantâneo no Netlify
├── 📄 Dockerfile                # Imagem de produção ultraleve (Nginx Alpine)
├── 📄 docker-compose.yml        # Orquestração de container pronta para uso
├── 📄 nginx.conf                # Configuração Nginx com gzip, headers e cache
├── 📄 .gitignore                # Regras de exclusão do Git (proteção de backups privados)
├── 📄 .editorconfig             # Padronização de formatação de código
├── 📄 README.md                 # Esta documentação completa
├── 📄 LEIA-ME.txt               # Guia rápido de uso em texto puro
└── 📁 app/                      # Código-fonte da aplicação web
    ├── 📄 index.html            # Ponto de entrada com meta tags PWA e OpenGraph
    ├── 📄 manifest.webmanifest  # Manifesto PWA para instalação no celular/desktop
    ├── 📄 sw.js                 # Service Worker para cache e uso offline
    ├── 📁 assets/               # Fontes locais e ícones vetoriais
    │   ├── 📄 favicon.svg       # Ícone da aplicação
    │   ├── 📄 geist.woff2       # Fonte tipográfica Geist
    │   └── 📄 inter.woff2       # Fonte tipográfica Inter
    ├── 📁 styles/               # Folhas de estilo CSS
    │   ├── 📄 tokens.css        # Variáveis de design (cores, espaçamentos, temas)
    │   └── 📄 app.css           # Estilos principais da aplicação e componentes
    └── 📁 js/                   # Módulos JavaScript (ES Modules nativos)
        ├── 📄 app.mjs           # Roteamento e orquestrador principal
        ├── 📄 store.mjs         # Gerenciamento de estado e persistência
        ├── 📄 domain.mjs        # Regras de negócio, cálculos e validações
        ├── 📄 initial-state.mjs # Estado financeiro inicial limpo
        ├── 📄 classification.mjs# Sistema de tags, categorias e prioridades
        ├── 📄 backup.mjs        # Mecanismos de exportação e importação JSON
        ├── 📄 flow-data.mjs     # Agregações para gráficos de fluxo
        ├── 📄 goal-analytics.mjs# Inteligência e cálculos para metas
        ├── 📄 profile.mjs       # Configuração de avatares e perfil
        ├── 📄 ui.mjs            # Biblioteca de componentes UI reutilizáveis
        ├── 📄 workspace-menu.mjs# Menu de contexto do espaço pessoal
        └── 📁 views/            # Telas da aplicação
            ├── 📄 overview.mjs       # Dashboard principal (Visão Geral)
            ├── 📄 transactions.mjs   # Extrato, busca avançada e filtros
            ├── 📄 cards.mjs          # Gestão de cartões e faturas
            ├── 📄 goals.mjs          # Metas financeiras e aportes
            ├── 📄 goal-insights.mjs  # Alertas e projeções de metas
            ├── 📄 flow-chart.mjs     # Gráficos dinâmicos (linha, barra, pizza)
            ├── 📄 profile.mjs        # Customização do perfil e avatar
            └── 📄 settings.mjs       # Backup, restauração, tema e reset
```

---

## 🚀 Como Executar Localmente

### Opção 1: Clique Duplo (Windows)
1. Dê dois cliques no arquivo `Iniciar-Windows.bat`.
2. O script detecta automaticamente se você possui **Python** ou **Node.js** e inicia o servidor.
3. O navegador abrirá automaticamente em `http://127.0.0.1:8765`.

### Opção 2: Clique Duplo (macOS / Linux)
1. Dê dois cliques em `Iniciar-Mac-Linux.command` (ou execute `./Iniciar-Mac-Linux.command` no terminal).
2. O app será aberto no navegador padrão.

### Opção 3: Via Node.js (Terminal)
```bash
# Iniciar o servidor
npm start
# ou
node server.mjs
```

### Opção 4: Via Python (Terminal)
```bash
# No Windows:
py -3 iniciar.py

# No macOS / Linux:
python3 iniciar.py
```

---

## 🌐 Opções de Deploy

O Finance OS é uma **Single Page Application (SPA) estática pura**, o que significa que pode ser hospedado gratuitamente e com máxima performance em qualquer provedor moderno:

### 1. Vercel
1. Conecte seu repositório no [Vercel Dashboard](https://vercel.com).
2. A Vercel detectará automaticamente o arquivo `vercel.json` já configurado na raiz.
3. Clique em **Deploy**. O site estará no ar com HTTPS, CDN global e cabeçalhos de segurança.

### 2. Netlify
1. Conecte o repositório no [Netlify](https://www.netlify.com).
2. O arquivo `netlify.toml` já define a pasta de publicação como `app/` e configura os redirecionamentos de rota.
3. Clique em **Deploy Site**.

### 3. Docker / Servidor Próprio (VPS)
Para rodar em qualquer VPS (DigitalOcean, AWS, Linode, Hetzner, etc.):
```bash
# Construir e rodar em segundo plano
docker compose up -d
```
A aplicação estará disponível na porta `8765` servida por um Nginx Alpine otimizado com compressão Gzip.

### 4. GitHub Pages / Cloudflare Pages
- **GitHub Pages:** Aponte a fonte das páginas para a pasta `/app` na branch principal.
- **Cloudflare Pages:** Defina o diretório de saída como `app` e o comando de build vazio.

---

## 🛡️ Segurança & Privacidade de Dados

1. **Onde ficam os dados?**
   - Os registros financeiros ficam salvos exclusivamente no `localStorage` do seu navegador.
   - Não há banco de dados remoto ou telemetria enviada a servidores de terceiros.
2. **Backups recomendados:**
   - Acesse **Configurações > Backup e transferência > Baixar backup completo** periodicamente.
   - Guarde seu arquivo JSON em um local seguro (drive privado, pendrive ou cofre de senhas).
3. **Múltiplos Dispositivos:**
   - Como os dados ficam locais, para transferir entre seu computador e celular, basta baixar o backup no computador e usar "Restaurar backup" no celular.

---

## 🛠️ Tecnologias Utilizadas

- **HTML5 Semântico & PWA:** Total acessibilidade e capacidade de instalação.
- **CSS3 Vanilla & Design Tokens:** Paleta moderna, sem frameworks externos, suporte nativo a temas escuro e claro.
- **JavaScript Moderno (ES2022+):** Módulos nativos (`import`/`export`), sem necessidade de bundlers complexos como Webpack ou Babel.
- **SVG & Canvas:** Gráficos e ícones vetoriais leves e responsivos.

---

## 📄 Licença

Distribuído sob a licença **MIT**. Sinta-se livre para usar, customizar e expandir seu próprio Finance OS.
