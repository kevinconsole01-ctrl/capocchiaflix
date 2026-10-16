# Caponioflix

App web (PWA) para descobrir filmes e séries de TV via [TMDB](https://www.themoviedb.org/), com:

- Busca com debounce, filtros por gênero, serviço de streaming e ano
- Seções: Home, Preferiti, Continua a guardare, Top (por plataforma) e Consigliati (quiz de gostos)
- Login opcional com Firebase (e-mail/senha) para sincronizar preferitos e progresso entre dispositivos
- Offline: service worker com cache de assets e imagens

## Estrutura

| Arquivo | Função |
|---------|--------|
| `index.html` | Markup da página |
| `styles.css` | Estilos |
| `app.js` | Lógica da aplicação (busca, TMDB, Firebase, modais) |
| `sw.js` | Service worker (cache offline) |
| `manifest.json` | Configuração PWA |
| `icon-192.png` / `icon-512.png` | Ícones do app |

## Rodar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Configuração

### TMDB
A chave da API está em `app.js` (`const API_KEY`). Para usar a sua:
1. Crie uma conta em https://www.themoviedb.org/settings/api
2. Substitua o valor de `API_KEY` em `app.js`

> A chave é exposta no cliente (comportamento normal em apps 100% front-end). Monitore o uso no painel da TMDB.

### Firebase (login + sync, opcional)
Sem Firebase o app funciona normalmente (preferitos ficam no `localStorage`). Para ativar o login:
1. Crie um projeto gratuito em https://console.firebase.google.com
2. Ative **Authentication → Sign-in method → Email/Password**
3. Crie um **Firestore Database** (modo produção) e configure regras de segurança restritivas (ex.: cada usuário só lê/escreve o próprio documento)
4. Em **Configuração do projeto → Seus apps → Web**, copie a `firebaseConfig` para `app.js`

## Deploy

Funciona em qualquer hospedagem estática (GitHub Pages, Netlify, Cloudflare Pages, etc.). É obrigatório servir via **HTTPS** (requisito de service workers e PWA).
