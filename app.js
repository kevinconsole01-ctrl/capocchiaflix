    // Registrazione service worker: necessaria su Android/Chrome perché il sito
    // venga riconosciuto come "installabile" e si apra come app (senza barra indirizzi)
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        });
    }

    const API_KEY = "19a3e7d1a5356e8daa2323dabc5e1a2d";

    // ===== Helpers de rede TMDB: timeout, retry e cache em memória =====
    const TMDB_TIMEOUT_MS = 10000;
    const TMDB_CACHE_MAX = 120;
    const tmdbCache = new Map();

    async function tmdbFetch(url, { useCache = true } = {}) {
        if (useCache && tmdbCache.has(url)) {
            return tmdbCache.get(url).clone();
        }
        let lastErr = null;
        let permanentErr = null;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0) {
                await new Promise((r) => setTimeout(r, 400 * attempt));
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);
            try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timer);
                if (res.ok) {
                    if (useCache) {
                        tmdbCache.set(url, res.clone());
                        if (tmdbCache.size > TMDB_CACHE_MAX) {
                            tmdbCache.delete(tmdbCache.keys().next().value);
                        }
                    }
                    return res;
                }
                // 4xx (exceto 429) são definitivos: não adianta repetir
                if (res.status !== 429 && res.status < 500) {
                    permanentErr = new Error(`Erro TMDB (${res.status})`);
                    break;
                }
                lastErr = new Error(`Erro TMDB (${res.status})`);
            } catch (err) {
                clearTimeout(timer);
                lastErr = (err && err.name === 'AbortError')
                    ? new Error('Tempo esgotado ao contatar o TMDB')
                    : err;
            }
        }
        if (permanentErr) throw permanentErr;
        throw lastErr || new Error('Falha de rede');
    }

    // Placeholder local (evita depender de serviços externos fora do ar)
    const {
        POSTER_PLACEHOLDER, posterUrl, formatRuntime, formatCountries,
        getFavoriteKey, getContinueKey, STREAMING_PROVIDERS, GENRES_BY_TYPE,
        getGenreLabel, getProviderLabel
    } = window.CapoHelpers;

    function montaStatusMsg(texto) {
        const div = document.createElement('div');
        div.className = 'status-msg';
        div.textContent = texto;
        return div;
    }

    // ===== Toasts (substituem os alert() bloqueantes) =====
    const TOAST_DURACAO_MS = 4200;

    function mostraToast(mensagem, tipo = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) {
            alert(mensagem);
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'toast' + (tipo === 'error' ? ' is-error' : '');
        const texto = document.createElement('span');
        texto.textContent = mensagem;
        const fechar = document.createElement('button');
        fechar.type = 'button';
        fechar.className = 'toast-close';
        fechar.setAttribute('aria-label', 'Chiudi notifica');
        fechar.textContent = '✕';
        const remover = () => {
            if (!toast.parentNode) return;
            toast.classList.add('is-leaving');
            setTimeout(() => toast.remove(), 260);
        };
        fechar.addEventListener('click', remover);
        toast.appendChild(texto);
        toast.appendChild(fechar);
        container.appendChild(toast);
        setTimeout(remover, TOAST_DURACAO_MS);
    }

    function mostraSkeleton(quantos = 8) {
        const listContainer = document.getElementById('resultsList');
        listContainer.innerHTML = '';
        for (let i = 0; i < quantos; i++) {
            const card = document.createElement('div');
            card.className = 'skeleton-card';
            const img = document.createElement('div');
            img.className = 'skeleton-img';
            const line = document.createElement('div');
            line.className = 'skeleton-line';
            card.appendChild(img);
            card.appendChild(line);
            listContainer.appendChild(card);
        }
    }

    function impostaMaisResultados() {
        const btn = document.getElementById('btnLoadMore');
        if (btn) btn.style.display = 'inline-flex';
        const sentinel = document.getElementById('scrollSentinel');
        if (sentinel) sentinel.style.display = '';
    }

    function impostaFimResultados() {
        const btn = document.getElementById('btnLoadMore');
        if (btn) btn.style.display = 'none';
        const sentinel = document.getElementById('scrollSentinel');
        if (sentinel) sentinel.style.display = 'none';
    }

    // ===== Modais: Esc, focus-trap e restauração de foco =====
    const MODAL_IDS = ['authModal', 'trailerModal', 'overviewModal', 'progressModal', 'recModal', 'playerModal'];
    let focoAntesDoModal = null;

    function modalAberto() {
        for (let i = MODAL_IDS.length - 1; i >= 0; i--) {
            const el = document.getElementById(MODAL_IDS[i]);
            if (el && el.classList.contains('is-open')) return el;
        }
        return null;
    }

    function registrarFocoModal() {
        if (!focoAntesDoModal) {
            focoAntesDoModal = document.activeElement;
        }
    }

    function restaurarFocoModal() {
        if (focoAntesDoModal && typeof focoAntesDoModal.focus === 'function') {
            focoAntesDoModal.focus();
        }
        focoAntesDoModal = null;
    }

    function focoNoModal(modalEl) {
        const alvo = modalEl.querySelector('button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])');
        if (alvo) alvo.focus();
    }

    // ===== Tema claro/escuro =====
    const THEME_STORAGE_KEY = 'caponioflix_theme';

    function temaAtual() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }

    function aplicarTema(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('themeToggle');
        if (btn) {
            btn.textContent = theme === 'light' ? '☀️' : '🌙';
            btn.setAttribute('aria-label', theme === 'light' ? 'Attiva tema scuro' : 'Attiva tema chiaro');
        }
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#f3f3f3' : '#181818');
    }

    function toggleTheme() {
        const novo = temaAtual() === 'dark' ? 'light' : 'dark';
        aplicarTema(novo);
        try {
            localStorage.setItem(THEME_STORAGE_KEY, novo);
        } catch (e) { /* sem localStorage */ }
    }

    // ===== Histórico de buscas =====
    const SEARCH_HISTORY_KEY = 'caponioflix_search_history';
    const SEARCH_HISTORY_MAX = 8;

    function carregarHistoricoBuscas() {
        try {
            const saved = localStorage.getItem(SEARCH_HISTORY_KEY);
            const list = saved ? JSON.parse(saved) : [];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    function salvarBuscaNoHistorico(query) {
        const q = query.trim();
        if (!q) return;
        let hist = carregarHistoricoBuscas().filter(item => String(item).toLowerCase() !== q.toLowerCase());
        hist.unshift(q);
        hist = hist.slice(0, SEARCH_HISTORY_MAX);
        try {
            localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(hist));
        } catch (e) { /* sem localStorage */ }
        renderHistoricoBuscas();
    }

    function fecharHistoricoBuscas() {
        const box = document.getElementById('searchHistory');
        if (box) box.hidden = true;
    }

    function renderHistoricoBuscas() {
        const box = document.getElementById('searchHistory');
        if (!box) return;
        const hist = carregarHistoricoBuscas();
        box.innerHTML = '';
        if (!hist.length) {
            box.hidden = true;
            return;
        }
        const titulo = document.createElement('div');
        titulo.className = 'search-history-title';
        titulo.textContent = 'Ricerche recenti';
        box.appendChild(titulo);
        hist.forEach(q => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'search-history-item';
            btn.textContent = q;
            btn.addEventListener('click', () => {
                const input = document.getElementById('searchInput');
                input.value = q;
                aggiornaVisibilitaClearRicerca();
                box.hidden = true;
                clearTimeout(debounceTimer);
                cerca(true);
            });
            box.appendChild(btn);
        });
        const limpar = document.createElement('button');
        limpar.type = 'button';
        limpar.className = 'search-history-clear';
        limpar.textContent = 'Cancella cronologia';
        limpar.addEventListener('click', () => {
            try {
                localStorage.removeItem(SEARCH_HISTORY_KEY);
            } catch (e) { /* sem localStorage */ }
            renderHistoricoBuscas();
        });
        box.appendChild(limpar);
        box.hidden = false;
    }

    let currentType = 'movie';
    let risultatiRicerca = [];
    let elementoSelezionato = null;
    let popupStack = [];
    let currentPage = 1;
    let isSearchMode = false;
    let selectedGenreId = null;
    let selectedProviderId = null;
    const YEAR_MIN = 1950;
    const YEAR_MAX = new Date().getFullYear();
    let selectedYearMin = YEAR_MIN;
    let selectedYearMax = YEAR_MAX;
    let currentSort = 'popolarita';
    const SORT_LABELS = {
        popolarita: 'Popolarità',
        voto: 'Voto più alto',
        recente: 'Più recenti'
    };

    // ===== Idioma dos conteúdos TMDB =====
    const LANGUAGE_STORAGE_KEY = 'caponioflix_language';
    const LINGUAS = {
        'it-IT': { label: 'Italiano', locale: 'it' },
        'pt-BR': { label: 'Português', locale: 'pt-BR' },
        'en-US': { label: 'English', locale: 'en' }
    };
    let currentLanguage = 'it-IT';
    try {
        const langSalva = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (LINGUAS[langSalva]) currentLanguage = langSalva;
    } catch (e) { /* sem localStorage */ }

    function mudaLingua(value) {
        if (!LINGUAS[value]) return;
        currentLanguage = value;
        try {
            localStorage.setItem(LANGUAGE_STORAGE_KEY, value);
        } catch (e) { /* sem localStorage */ }
        ricaricaLista(true);
    }
    const SEARCH_DEBOUNCE_MS = 500;
    const FAVORITES_STORAGE_KEY = 'caponioflix_favorites';
    const CONTINUE_STORAGE_KEY = 'caponioflix_continue_watching';
    const TASTE_STORAGE_KEY = 'caponioflix_gusti_profilo';
    const TASTE_SEEN_KEY = 'caponioflix_gusti_visti';
    let debounceTimer;
    let favorites = [];
    let continueWatching = [];
    let elementoRuntimeMinuti = null;
    let tasteProfile = null;
    let tasteSeenKeys = [];
    let quizStep = 0;
    let quizAnswers = {};
    let consigliatiCache = [];
    let currentView = 'home';

    // ===== Firebase: account e sincronizzazione cloud =====
    // 1. Vai su https://console.firebase.google.com, crea un progetto gratuito (Spark plan).
    // 2. In "Autenticazione" > "Sign-in method" attiva il provider "Email/Password".
    // 3. In "Firestore Database" crea un database (modalità produzione va bene, le regole sono sotto).
    // 4. Vai in "Impostazioni progetto" > "Le tue app" > "Web" e copia qui sotto l'oggetto di configurazione.
    const firebaseConfig = {
        apiKey: "AIzaSyBTnm_NOA6kcboaRUSRo3HZ67sSSlI0f0Y",
        authDomain: "caponioflix.firebaseapp.com",
        projectId: "caponioflix",
        storageBucket: "caponioflix.firebasestorage.app",
        messagingSenderId: "183803072510",
        appId: "1:183803072510:web:4a5602ef4be04dad8e7aaf"
    };

    let firebaseReady = false;
    let auth = null;
    let db = null;
    let firebasePromise = null;

    function firebaseConfigValida() {
        return !!(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('INCOLLA'));
    }

    // Carrega o SDK do Firebase sob demanda (modal de conta ou sessão anterior),
    // em vez de sempre no carregamento da página.
    function carregarFirebase() {
        if (firebasePromise) return firebasePromise;
        if (!firebaseConfigValida()) {
            console.warn('Firebase non configurato: incolla la tua firebaseConfig per attivare login e sincronizzazione.');
            return Promise.reject(new Error('firebase non configurato'));
        }
        firebasePromise = new Promise((resolve, reject) => {
            const fontes = [
                'https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js',
                'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth-compat.js',
                'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore-compat.js'
            ];
            let indice = 0;
            const carregarProximo = () => {
                if (indice >= fontes.length) {
                    try {
                        firebase.initializeApp(firebaseConfig);
                        auth = firebase.auth();
                        db = firebase.firestore();
                        firebaseReady = true;
                        auth.onAuthStateChanged((user) => {
                            currentUser = user;
                            aggiornaUIAccount();
                            if (user) {
                                caricaDatiCloud(user.uid);
                            }
                        });
                        resolve();
                    } catch (e) {
                        console.warn('Impossibile inizializzare Firebase.', e);
                        reject(e);
                    }
                    return;
                }
                const s = document.createElement('script');
                s.src = fontes[indice++];
                s.onload = carregarProximo;
                s.onerror = () => reject(new Error('Falha ao carregar o Firebase'));
                document.head.appendChild(s);
            };
            carregarProximo();
        });
        return firebasePromise;
    }

    function possuiSessaoFirebase() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const chave = localStorage.key(i);
                if (chave && chave.indexOf('firebase:authUser:') === 0) return true;
            }
        } catch (e) { /* sem localStorage */ }
        return false;
    }

    let currentUser = null;
    let isAuthRegisterMode = false;
    let cloudSyncTimer = null;
    let isApplyingCloudData = false;

    function apriModaleAccount() {
        registrarFocoModal();
        if (!firebaseReady) {
            impostaStatoSync('Caricamento accesso...');
            carregarFirebase()
                .then(() => impostaStatoSync(''))
                .catch(() => impostaStatoSync(''));
        }
        const modal = document.getElementById('authModal');
        modal.classList.add('is-open');
        document.getElementById('authModalError').textContent = '';
        if (!currentUser) {
            setAuthMode(false);
        }
        aggiornaUIAccount();
        focoNoModal(modal);
    }

    function chiudiModaleAccount() {
        document.getElementById('authModal').classList.remove('is-open');
        restaurarFocoModal();
    }

    function setAuthMode(isRegister) {
        isAuthRegisterMode = isRegister;
        document.getElementById('authTabs').classList.toggle('is-register', isRegister);
        document.getElementById('authTabLogin').classList.toggle('active', !isRegister);
        document.getElementById('authTabRegister').classList.toggle('active', isRegister);
        document.getElementById('authModalSubtitle').textContent = isRegister
            ? 'Crea un account per salvare i tuoi dati e ritrovarli su ogni dispositivo.'
            : 'Accedi per sincronizzare preferiti, continua a guardare e consigliati su tutti i tuoi dispositivi.';
        document.getElementById('authSubmitBtn').textContent = isRegister ? 'Registrati' : 'Accedi';
        document.getElementById('authRememberRow').style.display = isRegister ? 'none' : 'flex';
        document.getElementById('authModalError').textContent = '';
        document.getElementById('authModalError').classList.remove('is-success');
    }

    function togglePasswordVisibility() {
        const input = document.getElementById('authPasswordInput');
        const btn = document.getElementById('authEyeToggle');
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.setAttribute('aria-label', isHidden ? 'Nascondi password' : 'Mostra password');
        btn.innerHTML = isHidden
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a18.6 18.6 0 0 1 4.22-5.06M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    }

    async function eseguiAuthSubmit() {
        if (!firebaseReady) {
            try {
                await carregarFirebase();
            } catch (e) {
                document.getElementById('authModalError').textContent = 'Sincronizzazione non ancora configurata (manca firebaseConfig).';
                return;
            }
        }
        const email = document.getElementById('authEmailInput').value.trim();
        const password = document.getElementById('authPasswordInput').value;
        const errorEl = document.getElementById('authModalError');
        errorEl.classList.remove('is-success');
        errorEl.textContent = '';

        if (!email || !password) {
            errorEl.textContent = 'Inserisci email e password.';
            return;
        }

        const submitBtn = document.getElementById('authSubmitBtn');
        submitBtn.disabled = true;

        const ricordami = document.getElementById('authRememberCheckbox').checked;
        // "Ricordami" attivo -> resta loggato anche dopo aver chiuso il browser (persistenza LOCAL, è il default di Firebase).
        // "Ricordami" disattivo -> il login viene dimenticato alla chiusura della scheda/browser (persistenza SESSION).
        const persistenza = ricordami
            ? firebase.auth.Auth.Persistence.LOCAL
            : firebase.auth.Auth.Persistence.SESSION;

        auth.setPersistence(persistenza)
            .then(() => {
                return isAuthRegisterMode
                    ? auth.createUserWithEmailAndPassword(email, password)
                    : auth.signInWithEmailAndPassword(email, password);
            })
            .then(() => {
                document.getElementById('authEmailInput').value = '';
                document.getElementById('authPasswordInput').value = '';
            })
            .catch((err) => {
                errorEl.textContent = tradurreErroreAuth(err);
            })
            .finally(() => {
                submitBtn.disabled = false;
            });
    }

    async function richiediResetPassword() {
        if (!firebaseReady) {
            try {
                await carregarFirebase();
            } catch (e) {
                document.getElementById('authModalError').textContent = 'Sincronizzazione non ancora configurata (manca firebaseConfig).';
                return;
            }
        }
        const email = document.getElementById('authEmailInput').value.trim();
        const errorEl = document.getElementById('authModalError');
        errorEl.classList.remove('is-success');

        if (!email) {
            errorEl.textContent = 'Inserisci la tua email qui sopra, poi clicca di nuovo su "Password dimenticata?".';
            return;
        }

        auth.sendPasswordResetEmail(email)
            .then(() => {
                errorEl.textContent = 'Email inviata: controlla la posta per reimpostare la password.';
                errorEl.classList.add('is-success');
            })
            .catch((err) => {
                errorEl.textContent = tradurreErroreAuth(err);
            });
    }

    function eseguiLogout() {
        if (auth) {
            auth.signOut();
        }
    }

    function tradurreErroreAuth(err) {
        const code = err && err.code;
        switch (code) {
            case 'auth/email-already-in-use': return 'Esiste già un account con questa email.';
            case 'auth/invalid-email': return 'Email non valida.';
            case 'auth/weak-password': return 'La password deve avere almeno 6 caratteri.';
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential': return 'Email o password non corrette.';
            case 'auth/too-many-requests': return 'Troppi tentativi, riprova tra poco.';
            default: return 'Si è verificato un errore. Riprova.';
        }
    }

    function aggiornaUIAccount() {
        const btnLabel = document.getElementById('accountBtnLabel');
        const btn = document.getElementById('accountBtn');
        const viewLoggedOut = document.getElementById('authViewLoggedOut');
        const viewLoggedIn = document.getElementById('authViewLoggedIn');

        if (currentUser) {
            const iniziale = currentUser.email.charAt(0).toUpperCase();
            btnLabel.textContent = currentUser.email.split('@')[0];
            btn.classList.add('is-logged-in');
            btn.setAttribute('data-initial', iniziale);
            viewLoggedOut.style.display = 'none';
            viewLoggedIn.style.display = 'block';
            document.getElementById('authLoggedInEmail').textContent = currentUser.email;
            document.getElementById('authAccountAvatar').textContent = iniziale;
        } else {
            btnLabel.textContent = 'Accedi';
            btn.classList.remove('is-logged-in');
            btn.removeAttribute('data-initial');
            viewLoggedOut.style.display = 'block';
            viewLoggedIn.style.display = 'none';
        }
    }

    function impostaStatoSync(testo) {
        const el = document.getElementById('authSyncStatus');
        if (el) el.textContent = testo;
    }

    // Carica i dati salvati su Firestore per l'utente loggato e aggiorna l'interfaccia
    function caricaDatiCloud(uid) {
        if (!db) return;
        impostaStatoSync('Sincronizzazione in corso...');
        db.collection('utenti').doc(uid).get()
            .then((doc) => {
                isApplyingCloudData = true;
                if (doc.exists) {
                    const dati = doc.data();
                    favorites = Array.isArray(dati.favorites) ? dati.favorites : [];
                    continueWatching = Array.isArray(dati.continueWatching) ? dati.continueWatching : [];
                    tasteProfile = dati.tasteProfile || null;
                    tasteSeenKeys = Array.isArray(dati.tasteSeenKeys) ? dati.tasteSeenKeys : [];
                } else {
                    // Primo accesso: carica quello che c'era in locale su questo dispositivo come punto di partenza
                    loadFavorites();
                    loadContinueWatching();
                    loadTasteProfile();
                }
                isApplyingCloudData = false;
                renderFavoritesSection();
                if (typeof renderContinueSection === 'function') renderContinueSection();
                if (typeof renderConsigliatiSection === 'function') renderConsigliatiSection();
                salvaDatiCloud(true);
                impostaStatoSync('Dati sincronizzati su questo account.');
            })
            .catch((err) => {
                isApplyingCloudData = false;
                console.warn('Impossibile caricare i dati dal cloud.', err);
                impostaStatoSync('Impossibile sincronizzare: controlla la connessione.');
            });
    }

    // Salva su Firestore lo stato attuale (con debounce per evitare troppe scritture ravvicinate)
    function salvaDatiCloud(immediato) {
        if (!db || !currentUser || isApplyingCloudData) return;
        if (cloudSyncTimer) clearTimeout(cloudSyncTimer);

        const esegui = () => {
            db.collection('utenti').doc(currentUser.uid).set({
                favorites,
                continueWatching,
                tasteProfile,
                tasteSeenKeys,
                aggiornatoIl: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true }).catch((err) => {
                console.warn('Impossibile salvare i dati sul cloud.', err);
            });
        };

        if (immediato) {
            esegui();
        } else {
            cloudSyncTimer = setTimeout(esegui, 800);
        }
    }

    // Mappatura concettuale dei generi: ogni concetto ha gli ID genere corretti sia per film che per serie TV su TMDB
    const GENRE_CONCEPTS = {
        azione_avventura:      { label: 'Azione e avventura',            movie: [28, 12],   tv: [10759] },
        animazione:            { label: 'Animazione',                     movie: [16],       tv: [16] },
        commedia:               { label: 'Commedia',                      movie: [35],       tv: [35] },
        crime:                  { label: 'Crime e investigativo',         movie: [80],       tv: [80] },
        documentario:           { label: 'Documentario',                  movie: [99],       tv: [99] },
        dramma:                 { label: 'Dramma',                        movie: [18],       tv: [18] },
        famiglia:               { label: 'Famiglia',                      movie: [10751],    tv: [10751] },
        fantascienza_fantasy:   { label: 'Fantascienza e fantasy',        movie: [878, 14],  tv: [10765] },
        horror:                 { label: 'Horror',                       movie: [27],       tv: [] },
        mistero:                { label: 'Mistero',                      movie: [9648],     tv: [9648] },
        musica:                 { label: 'Musical e biopic musicali',     movie: [10402],    tv: [] },
        romantico:              { label: 'Romantico',                    movie: [10749],    tv: [] },
        thriller:               { label: 'Thriller',                     movie: [53],       tv: [] },
        guerra:                 { label: 'Guerra e conflitti storici',    movie: [10752],    tv: [10768] },
        storico_biografico:     { label: 'Storico e biografico',         movie: [36],       tv: [] },
        western:                { label: 'Western',                      movie: [37],       tv: [37] }
    };

    function opzioniGenereQuiz() {
        return Object.entries(GENRE_CONCEPTS).map(([key, data]) => ({ label: data.label, genreKey: key }));
    }

    const QUIZ_QUESTIONS = [
        {
            question: 'Quali generi ami di più? Scegli tutti quelli che vuoi.',
            multiSelect: true,
            options: opzioniGenereQuiz()
        },
        {
            question: 'Ci sono generi che proprio non fanno per te? Puoi selezionarne più di uno, oppure saltare la domanda.',
            multiSelect: true,
            optional: true,
            options: opzioniGenereQuiz().map(o => ({ label: o.label, avoidGenreKey: o.genreKey }))
        },
        {
            question: 'Che atmosfera cerchi di solito quando guardi qualcosa? Puoi selezionarne più di una.',
            multiSelect: true,
            options: [
                { label: 'Leggera e spensierata', genreKeys: ['commedia', 'animazione'] },
                { label: 'Intensa ed emotivamente coinvolgente', genreKeys: ['dramma', 'romantico'] },
                { label: 'Adrenalinica, piena d\'azione', genreKeys: ['azione_avventura', 'thriller'] },
                { label: 'Cupa e inquietante', genreKeys: ['horror', 'mistero'] },
                { label: 'Epica e visionaria', genreKeys: ['fantascienza_fantasy', 'guerra'] },
                { label: 'Intellettuale e stimolante', genreKeys: ['documentario', 'storico_biografico'] },
                { label: 'Assurda e demenziale', genreKeys: ['commedia'] },
                { label: 'Investigativa, con misteri da risolvere', genreKeys: ['crime', 'mistero'] }
            ]
        },
        {
            question: 'Con chi guardi più spesso film o serie? Puoi selezionarne più di una.',
            multiSelect: true,
            optional: true,
            options: [
                { label: 'Da solo/a, mi piace concentrarmi', genreKeys: ['mistero', 'thriller'] },
                { label: 'In coppia', genreKeys: ['romantico', 'dramma'] },
                { label: 'Con tutta la famiglia, anche con bambini', genreKeys: ['famiglia', 'animazione'] },
                { label: 'Con gli amici, per una serata movimentata', genreKeys: ['commedia', 'azione_avventura'] }
            ]
        },
        {
            question: 'Quanto ami i colpi di scena e i finali a sorpresa?',
            multiSelect: false,
            options: [
                { label: 'Moltissimo, sono ciò che cerco di più', genreKeys: ['mistero', 'thriller'] },
                { label: 'Mi piacciono se ben fatti, ma non sono essenziali' },
                { label: 'Non mi interessano particolarmente' }
            ]
        },
        {
            question: 'Ti piacciono le storie tratte da libri, fumetti o eventi realmente accaduti? Puoi selezionarne più di una.',
            multiSelect: true,
            optional: true,
            options: [
                { label: 'Adattamenti di romanzi e libri', genreKeys: ['dramma', 'storico_biografico'] },
                { label: 'Fumetti e supereroi', genreKeys: ['fantascienza_fantasy', 'azione_avventura'] },
                { label: 'Storie vere e biografie', genreKeys: ['storico_biografico', 'documentario'] },
                { label: 'Preferisco le storie originali, non tratte da altro' }
            ]
        },
        {
            question: 'Cosa vuoi guardare?',
            multiSelect: false,
            options: [
                { label: 'Solo film', typePref: 'movie' },
                { label: 'Solo serie TV', typePref: 'tv' },
                { label: 'Sia film che serie TV', typePref: 'both' }
            ]
        },
        {
            question: 'Se guardi serie TV, che formato preferisci?',
            multiSelect: false,
            options: [
                { label: 'Miniserie brevi, con poche puntate', tvType: 2 },
                { label: 'Serie classiche con tante stagioni', tvType: 4 },
                { label: 'Indifferente, guardo entrambi i formati' }
            ]
        },
        {
            question: 'Da che epoca preferisci che arrivino i tuoi titoli? Puoi selezionarne più di una.',
            multiSelect: true,
            options: [
                { label: 'Classici, prima degli anni \'80', yearMin: YEAR_MIN, yearMax: 1979 },
                { label: 'Anni \'80 e \'90', yearMin: 1980, yearMax: 1999 },
                { label: 'Anni 2000', yearMin: 2000, yearMax: 2009 },
                { label: 'Anni 2010', yearMin: 2010, yearMax: 2019 },
                { label: 'Uscite più recenti', yearMin: 2020, yearMax: YEAR_MAX }
            ]
        },
        {
            question: 'Quanto deve durare un film per te? Puoi selezionarne più di una (vale solo per i film).',
            multiSelect: true,
            options: [
                { label: 'Breve, meno di 90 minuti', runtimeMin: 0, runtimeMax: 89 },
                { label: 'Formato standard, 90-120 minuti', runtimeMin: 90, runtimeMax: 120 },
                { label: 'Lungo, 120-160 minuti', runtimeMin: 120, runtimeMax: 160 },
                { label: 'Kolossal, oltre 160 minuti', runtimeMin: 160, runtimeMax: 400 },
                { label: 'Non ho preferenze sulla durata', runtimeMin: 0, runtimeMax: 400 }
            ]
        },
        {
            question: 'Da dove preferisci che arrivino i tuoi film e le tue serie? Puoi selezionarne più di una.',
            multiSelect: true,
            options: [
                { label: 'Cinema hollywoodiano / americano', languages: ['en'] },
                { label: 'Cinema europeo (Italia, Francia, Spagna, UK...)', languages: ['it', 'fr', 'es', 'de', 'en-GB'] },
                { label: 'Cinema e serie asiatiche (Giappone, Corea, Cina)', languages: ['ja', 'ko', 'zh'] },
                { label: 'Anime giapponesi', languages: ['ja'], genreKeys: ['animazione'] },
                { label: 'Non ho preferenze sulla provenienza', languages: [] }
            ]
        },
        {
            question: 'Quali piattaforme di streaming usi di più? Puoi selezionarne più di una.',
            multiSelect: true,
            optional: true,
            options: [
                { label: 'Netflix', platformIds: [8] },
                { label: 'Disney+', platformIds: [337] },
                { label: 'Amazon Prime Video', platformIds: [119] },
                { label: 'Apple TV+', platformIds: [2] },
                { label: 'Paramount+', platformIds: [531] },
                { label: 'Nessuna in particolare, guardo da più fonti' }
            ]
        },
        {
            question: 'Quanti contenuti forti (violenza, linguaggio scabroso, scene crude) riesci a tollerare?',
            multiSelect: false,
            options: [
                { label: 'Preferisco contenuti leggeri, adatti a tutti', certificationMax: 'PG' },
                { label: 'Un livello moderato va benissimo', certificationMax: 'PG-13' },
                { label: 'Nessun limite, anche contenuti forti e crudi' }
            ]
        },
        {
            question: 'Ti piacciono i franchise, le saghe e i sequel, oppure preferisci storie autoconclusive? Puoi selezionarne più di una.',
            multiSelect: true,
            optional: true,
            options: [
                { label: 'Adoro le saghe e gli universi condivisi', genreKeys: ['fantascienza_fantasy', 'azione_avventura'] },
                { label: 'Preferisco storie autoconclusive, un film e basta', genreKeys: ['dramma'] },
                { label: 'Mi va bene entrambi' }
            ]
        },
        {
            question: 'Quanto ti piace ridere durante un film o una serie?',
            multiSelect: false,
            options: [
                { label: 'Moltissimo, la commedia è il mio genere preferito', genreKeys: ['commedia'] },
                { label: 'Un po\' di leggerezza è sempre gradita', genreKeys: ['commedia'] },
                { label: 'Preferisco altri toni, la commedia non è essenziale per me' }
            ]
        },
        {
            question: 'Quanto ti emoziona la colonna sonora o la componente musicale di un\'opera?',
            multiSelect: false,
            options: [
                { label: 'Moltissimo, adoro i musical e i film musicali', genreKeys: ['musica'] },
                { label: 'Mi piace se presente, ma non è indispensabile' },
                { label: 'Non mi interessa particolarmente' }
            ]
        },
        {
            question: 'Preferisci storie ambientate nella realtà quotidiana o in mondi immaginari e fantastici?',
            multiSelect: false,
            options: [
                { label: 'Realtà quotidiana, storie plausibili', genreKeys: ['dramma', 'crime'] },
                { label: 'Mondi fantastici e immaginari', genreKeys: ['fantascienza_fantasy'] },
                { label: 'Mi piacciono entrambi allo stesso modo' }
            ]
        },
        {
            question: 'Quanto ami le storie con al centro relazioni sentimentali?',
            multiSelect: false,
            options: [
                { label: 'Moltissimo, sono un elemento che cerco sempre', genreKeys: ['romantico'] },
                { label: 'Va bene se presenti, ma non devono essere il fulcro' },
                { label: 'Preferisco evitarle quando possibile', avoidGenreKey: 'romantico' }
            ]
        },
        {
            question: 'Quanto deve essere apprezzato dalla critica un titolo per interessarti?',
            multiSelect: false,
            options: [
                { label: 'Voglio solo capolavori con voti altissimi', voteMin: 7.5 },
                { label: 'Un buon equilibrio tra qualità e varietà', voteMin: 6 },
                { label: 'Anche titoli di nicchia poco votati, non mi importa', voteMin: 0 }
            ]
        },
        {
            question: 'Preferisci titoli famosi o scoperte di nicchia?',
            multiSelect: false,
            options: [
                { label: 'Solo blockbuster e grandi successi', popolarita: 'blockbuster' },
                { label: 'Un mix equilibrato', popolarita: 'mix' },
                { label: 'Chicche di nicchia, poco conosciute', popolarita: 'nicchia' }
            ]
        }
    ];

    // Platform data: TMDB watch provider IDs (regione IT)
    const PLATFORMS = [
        { id: 8, name: 'Netflix', color: '#E50914', logo: 'https://upload.wikimedia.org/wikipedia/commons/0/08/Netflix_2015_logo.svg' },
        { id: 337, name: 'Disney+', color: '#113CCF', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Disney%2B_logo.svg' },
        { id: 119, name: 'Amazon Prime', color: '#00A8E1', logo: 'https://upload.wikimedia.org/wikipedia/commons/1/11/Amazon_Prime_Video_logo.svg' },
        { id: 2, name: 'Apple TV+', color: '#555555', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2a/Apple_TV_%282015%29_logo.svg' },
        { id: 531, name: 'Paramount+', color: '#0064FF', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Paramount%2B_logo.svg' }
    ];

    let currentPlatformId = PLATFORMS[0].id;
    let platformDataCache = {};

    // Filtro "Servizio streaming": ID provider TMDB (dati sourced da JustWatch), catalogo regione IT
    function loadFavorites() {
        try {
            const saved = localStorage.getItem(FAVORITES_STORAGE_KEY);
            favorites = saved ? JSON.parse(saved) : [];
        } catch {
            favorites = [];
        }
    }

    function saveFavorites() {
        try {
            localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
        } catch {
            console.warn('Impossibile salvare i preferiti su localStorage.');
        }
        salvaDatiCloud();
    }

    function isFavorite(item) {
        if (!item) return false;
        const key = getFavoriteKey(item, currentType);
        return favorites.some(entry => getFavoriteKey(entry, currentType) === key);
    }

    function updateFavoriteButton(item) {
        const btn = document.getElementById('btnFavorite');
        if (!btn) return;
        const active = isFavorite(item);
        btn.classList.toggle('active', active);
        btn.textContent = active ? '♥' : '♡';
        btn.setAttribute('aria-pressed', String(active));
        btn.setAttribute('aria-label', active ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti');
    }

    function toggleFavorite(item) {
        if (!item) return;
        const key = getFavoriteKey(item, currentType);
        const exists = favorites.some(entry => getFavoriteKey(entry, currentType) === key);

        if (exists) {
            favorites = favorites.filter(entry => getFavoriteKey(entry, currentType) !== key);
        } else {
            favorites.push({
                id: item.id,
                type: item.type || currentType,
                title: item.title || item.name || '',
                name: item.name || item.title || '',
                poster_path: item.poster_path || '',
                overview: item.overview || '',
                release_date: item.release_date || '',
                first_air_date: item.first_air_date || '',
                vote_average: item.vote_average || null,
                backdrop_path: item.backdrop_path || ''
            });
        }

        saveFavorites();
        updateFavoriteButton(item);
        renderFavoritesSection();
    }

    function renderFavoritesSection() {
        const container = document.getElementById('favoritesGrid');
        if (!container) return;

        if (!favorites.length) {
            container.innerHTML = '<div class="favorites-empty">Nessun titolo preferito. Aggiungi un cuore per salvarne uno.</div>';
            return;
        }

        container.innerHTML = '';
        favorites.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'card-item favorite-card';
            card.tabIndex = 0;

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'favorite-remove';
            removeBtn.textContent = '✕';
            removeBtn.onclick = (event) => {
                event.stopPropagation();
                favorites = favorites.filter(entry => getFavoriteKey(entry, currentType) !== getFavoriteKey(item, currentType));
                saveFavorites();
                renderFavoritesSection();
                updateFavoriteButton(elementoSelezionato);
            };

            const posterPath = item.poster_path
                ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                : POSTER_PLACEHOLDER;

            const img = document.createElement('img');

            img.loading = 'lazy';

            img.decoding = 'async';
            img.className = 'card-img';
            img.src = posterPath;
            img.alt = item.title || item.name || 'Preferito';
            img.style.aspectRatio = '2 / 3';

            const info = document.createElement('div');
            info.className = 'card-info';
            const titleEl = document.createElement('div');
            titleEl.className = 'card-title';
            titleEl.textContent = item.title || item.name || '';

            info.appendChild(titleEl);
            card.appendChild(removeBtn);
            card.appendChild(img);
            card.appendChild(info);
            card.onclick = () => {
                const favoriteType = item.type || 'movie';
                if (favoriteType !== currentType) {
                    currentType = favoriteType;
                    document.getElementById('btnMovie').classList.toggle('active', currentType === 'movie');
                    document.getElementById('btnTv').classList.toggle('active', currentType === 'tv');
                    const frame = document.getElementById('episodesFrame');
                    frame.classList.toggle('active', currentType === 'tv');
                    renderGenreTags();
                }
                popupStack = [];
                aggiornaStatoChiusuraRecModal();
                aggiornaHeroDaItem(item);
            };
            container.appendChild(card);
        });
    }

    /* ===================== CONTINUA A GUARDARE ===================== */

    function loadContinueWatching() {
        try {
            const saved = localStorage.getItem(CONTINUE_STORAGE_KEY);
            continueWatching = saved ? JSON.parse(saved) : [];
        } catch {
            continueWatching = [];
        }
    }

    function saveContinueWatching() {
        try {
            localStorage.setItem(CONTINUE_STORAGE_KEY, JSON.stringify(continueWatching));
        } catch {
            console.warn('Impossibile salvare "continua a guardare" su localStorage.');
        }
        salvaDatiCloud();
    }

    function trovaVoceContinua(item) {
        if (!item) return null;
        const key = getContinueKey(item);
        return continueWatching.find(entry => getContinueKey(entry) === key) || null;
    }

    function aggiornaProgressoButton(item, runtimeMinuti) {
        const btn = document.getElementById('btnProgress');
        if (!btn) return;
        const tipo = item?.type || currentType;
        elementoRuntimeMinuti = (tipo === 'movie' && runtimeMinuti) ? runtimeMinuti : null;

        if (tipo !== 'movie' || !elementoRuntimeMinuti) {
            btn.style.display = 'none';
            return;
        }

        btn.style.display = 'inline-flex';
        const voce = trovaVoceContinua(item);
        btn.classList.toggle('active', !!voce);
        btn.setAttribute('aria-label', voce ? 'Aggiorna posizione visione' : 'Salva posizione visione');
    }

    function apriProgressoModal() {
        if (!elementoSelezionato || !elementoRuntimeMinuti) return;
        const nome = elementoSelezionato.title || elementoSelezionato.name || '';
        document.getElementById('progressModalTitle').textContent = `Continua a guardare: ${nome}`;
        document.getElementById('progressTotalLabel').textContent = `/ ${elementoRuntimeMinuti} min`;

        const input = document.getElementById('progressInput');
        input.max = elementoRuntimeMinuti;
        const voce = trovaVoceContinua(elementoSelezionato);
        input.value = voce ? Math.min(voce.positionMinutes, elementoRuntimeMinuti) : 0;

        aggiornaLabelProgresso();
        registrarFocoModal();
        const modal = document.getElementById('progressModal');
        modal.classList.add('is-open');
        focoNoModal(modal);
    }

    function chiudiProgressoModal() {
        document.getElementById('progressModal').classList.remove('is-open');
        restaurarFocoModal();
    }

    function aggiornaLabelProgresso() {
        const input = document.getElementById('progressInput');
        const valore = Number(input.value);
        const max = Number(input.max) || 1;
        document.getElementById('progressCurrentLabel').textContent = `${valore} min`;
        const fill = document.getElementById('progressSliderFill');
        if (fill) fill.style.width = `${(valore / max) * 100}%`;
    }

    function salvaProgresso() {
        if (!elementoSelezionato || !elementoRuntimeMinuti) return;
        const input = document.getElementById('progressInput');
        const positionMinutes = Number(input.value);
        const key = getContinueKey(elementoSelezionato);

        const voce = {
            id: elementoSelezionato.id,
            type: 'movie',
            title: elementoSelezionato.title || '',
            name: elementoSelezionato.name || '',
            poster_path: elementoSelezionato.poster_path || '',
            overview: elementoSelezionato.overview || '',
            release_date: elementoSelezionato.release_date || '',
            vote_average: elementoSelezionato.vote_average || null,
            runtimeMinutes: elementoRuntimeMinuti,
            positionMinutes,
            updatedAt: Date.now()
        };

        const idx = continueWatching.findIndex(entry => getContinueKey(entry) === key);
        if (idx >= 0) {
            continueWatching[idx] = voce;
        } else {
            continueWatching.unshift(voce);
        }

        saveContinueWatching();
        aggiornaProgressoButton(elementoSelezionato, elementoRuntimeMinuti);
        if (currentView === 'continue') {
            renderContinueSection();
        }
        chiudiProgressoModal();
    }

    function rimuoviDaContinua(item, event) {
        if (event) event.stopPropagation();
        const key = getContinueKey(item);
        continueWatching = continueWatching.filter(entry => getContinueKey(entry) !== key);
        saveContinueWatching();
        renderContinueSection();
        if (elementoSelezionato) {
            aggiornaProgressoButton(elementoSelezionato, elementoRuntimeMinuti);
        }
    }

    function renderContinueSection() {
        const container = document.getElementById('continueGrid');
        if (!container) return;

        if (!continueWatching.length) {
            container.innerHTML = '<div class="favorites-empty">Nessun film in corso. Apri un film e tocca ⏱ per salvare a che minuto sei arrivato.</div>';
            return;
        }

        container.innerHTML = '';
        continueWatching
            .slice()
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
            .forEach((item) => {
                const card = document.createElement('div');
                card.className = 'card-item continue-card';
                card.tabIndex = 0;

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'favorite-remove';
                removeBtn.textContent = '✕';
                removeBtn.setAttribute('aria-label', 'Rimuovi da continua a guardare');
                removeBtn.onclick = (event) => rimuoviDaContinua(item, event);

                const posterPath = item.poster_path
                    ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                    : POSTER_PLACEHOLDER;

                const img = document.createElement('img');

                img.loading = 'lazy';

                img.decoding = 'async';
                img.className = 'card-img';
                img.src = posterPath;
                img.alt = item.title || item.name || 'Continua a guardare';

                const info = document.createElement('div');
                info.className = 'card-info';
                const titleEl = document.createElement('div');
                titleEl.className = 'card-title';
                titleEl.textContent = item.title || item.name || '';
                info.appendChild(titleEl);

                const percent = item.runtimeMinutes ? Math.min(100, Math.round((item.positionMinutes / item.runtimeMinutes) * 100)) : 0;

                const progressLabel = document.createElement('div');
                progressLabel.className = 'continue-progress-label';
                progressLabel.textContent = `${item.positionMinutes}/${item.runtimeMinutes} min`;

                const progressBar = document.createElement('div');
                progressBar.className = 'continue-progress-bar';
                const progressFill = document.createElement('div');
                progressFill.className = 'continue-progress-bar-fill';
                progressFill.style.width = `${percent}%`;
                progressBar.appendChild(progressFill);

                card.appendChild(removeBtn);
                card.appendChild(img);
                card.appendChild(progressLabel);
                card.appendChild(progressBar);
                card.appendChild(info);

                card.onclick = () => {
                    if (currentType !== 'movie') {
                        currentType = 'movie';
                        document.getElementById('btnMovie').classList.toggle('active', true);
                        document.getElementById('btnTv').classList.toggle('active', false);
                        document.getElementById('episodesFrame').classList.remove('active');
                        renderGenreTags();
                    }
                    popupStack = [];
                    aggiornaStatoChiusuraRecModal();
                    aggiornaHeroDaItem(item);
                };

                container.appendChild(card);
            });
    }

    /* ===================== CONSIGLIATI / QUIZ GUSTI ===================== */

    function loadTasteProfile() {
        try {
            const saved = localStorage.getItem(TASTE_STORAGE_KEY);
            tasteProfile = saved ? JSON.parse(saved) : null;
        } catch {
            tasteProfile = null;
        }
        try {
            const seen = localStorage.getItem(TASTE_SEEN_KEY);
            tasteSeenKeys = seen ? JSON.parse(seen) : [];
        } catch {
            tasteSeenKeys = [];
        }
    }

    function saveTasteProfile() {
        try {
            localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(tasteProfile));
        } catch {
            console.warn('Impossibile salvare i gusti su localStorage.');
        }
        salvaDatiCloud();
    }

    function saveTasteSeenKeys() {
        try {
            localStorage.setItem(TASTE_SEEN_KEY, JSON.stringify(tasteSeenKeys));
        } catch {
            console.warn('Impossibile salvare i titoli già consigliati.');
        }
        salvaDatiCloud();
    }

    let quizSelezioneCorrente = new Set();

    function nuovoAccumulatoreQuiz() {
        return {
            genreKeys: new Set(),
            avoidGenreKeys: new Set(),
            typePref: [],
            yearRanges: [],
            runtimeRanges: [],
            languages: new Set(),
            platformIds: new Set(),
            voteMin: 0,
            popolarita: 'mix',
            certificationMax: null,
            tvType: null
        };
    }

    function riavviaQuiz() {
        tasteProfile = null;
        tasteSeenKeys = [];
        quizStep = 0;
        quizAnswers = nuovoAccumulatoreQuiz();
        quizSelezioneCorrente = new Set();
        saveTasteProfile();
        saveTasteSeenKeys();
        renderConsigliatiSection();
    }

    function renderConsigliatiSection() {
        const restartBtn = document.getElementById('quizRestartBtn');
        if (!tasteProfile) {
            restartBtn.style.display = 'none';
            if (!quizAnswers || !quizAnswers.genreKeys) {
                quizAnswers = nuovoAccumulatoreQuiz();
                quizStep = 0;
            }
            renderQuizStep();
        } else {
            restartBtn.style.display = 'inline-block';
            caricaConsigliati(true);
        }
    }

    function renderQuizStep() {
        const container = document.getElementById('consigliatiContent');
        const domanda = QUIZ_QUESTIONS[quizStep];
        if (!domanda) {
            completaQuiz();
            return;
        }

        quizSelezioneCorrente = new Set();

        container.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'quiz-card';

        const progress = document.createElement('div');
        progress.className = 'quiz-progress';
        progress.textContent = `Domanda ${quizStep + 1} di ${QUIZ_QUESTIONS.length}`;

        const question = document.createElement('div');
        question.className = 'quiz-question';
        question.textContent = domanda.question;

        const options = document.createElement('div');
        options.className = 'quiz-options';

        domanda.options.forEach((opzione, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quiz-option-btn';
            btn.textContent = opzione.label;

            if (domanda.multiSelect) {
                btn.onclick = () => {
                    if (quizSelezioneCorrente.has(idx)) {
                        quizSelezioneCorrente.delete(idx);
                        btn.classList.remove('selected');
                    } else {
                        quizSelezioneCorrente.add(idx);
                        btn.classList.add('selected');
                    }
                };
            } else {
                btn.onclick = () => {
                    applicaRisposta(opzione);
                    quizStep++;
                    renderQuizStep();
                };
            }

            options.appendChild(btn);
        });

        card.appendChild(progress);
        card.appendChild(question);
        card.appendChild(options);

        if (domanda.multiSelect) {
            const continueBtn = document.createElement('button');
            continueBtn.type = 'button';
            continueBtn.className = 'quiz-restart-btn';
            continueBtn.style.marginTop = '20px';
            continueBtn.textContent = domanda.optional ? 'Continua (anche senza selezionare nulla)' : 'Continua';
            continueBtn.onclick = () => {
                if (!domanda.optional && quizSelezioneCorrente.size === 0) {
                    mostraToast('Seleziona almeno un\'opzione per continuare.');
                    return;
                }
                quizSelezioneCorrente.forEach(idx => applicaRisposta(domanda.options[idx]));
                quizStep++;
                renderQuizStep();
            };
            card.appendChild(continueBtn);
        }

        container.appendChild(card);
    }

    function applicaRisposta(opzione) {
        if (opzione.genreKey) {
            quizAnswers.genreKeys.add(opzione.genreKey);
        }
        if (opzione.genreKeys) {
            opzione.genreKeys.forEach(k => quizAnswers.genreKeys.add(k));
        }
        if (opzione.avoidGenreKey) {
            quizAnswers.avoidGenreKeys.add(opzione.avoidGenreKey);
        }
        if (opzione.typePref) {
            quizAnswers.typePref.push(opzione.typePref);
        }
        if (opzione.yearMin !== undefined) {
            quizAnswers.yearRanges.push([opzione.yearMin, opzione.yearMax]);
        }
        if (opzione.runtimeMin !== undefined) {
            quizAnswers.runtimeRanges.push([opzione.runtimeMin, opzione.runtimeMax]);
        }
        if (opzione.languages) {
            opzione.languages.forEach(l => quizAnswers.languages.add(l));
        }
        if (opzione.voteMin !== undefined) {
            quizAnswers.voteMin = opzione.voteMin;
        }
        if (opzione.popolarita) {
            quizAnswers.popolarita = opzione.popolarita;
        }
        if (opzione.platformIds) {
            opzione.platformIds.forEach(p => quizAnswers.platformIds.add(p));
        }
        if (opzione.certificationMax) {
            quizAnswers.certificationMax = opzione.certificationMax;
        }
        if (opzione.tvType !== undefined) {
            quizAnswers.tvType = opzione.tvType;
        }
    }

    function completaQuiz() {
        let tipo = 'both';
        if (quizAnswers.typePref.length) {
            tipo = quizAnswers.typePref[quizAnswers.typePref.length - 1];
        }

        const yearRanges = quizAnswers.yearRanges;
        const runtimeRanges = quizAnswers.runtimeRanges;

        tasteProfile = {
            genreKeys: Array.from(quizAnswers.genreKeys),
            avoidGenreKeys: Array.from(quizAnswers.avoidGenreKeys),
            type: tipo,
            yearMin: yearRanges.length ? Math.min(...yearRanges.map(r => r[0])) : YEAR_MIN,
            yearMax: yearRanges.length ? Math.max(...yearRanges.map(r => r[1])) : YEAR_MAX,
            runtimeMin: runtimeRanges.length ? Math.min(...runtimeRanges.map(r => r[0])) : null,
            runtimeMax: runtimeRanges.length ? Math.max(...runtimeRanges.map(r => r[1])) : null,
            languages: Array.from(quizAnswers.languages),
            platformIds: Array.from(quizAnswers.platformIds),
            voteMin: quizAnswers.voteMin,
            popolarita: quizAnswers.popolarita,
            certificationMax: quizAnswers.certificationMax,
            tvType: quizAnswers.tvType,
            updatedAt: Date.now()
        };

        tasteSeenKeys = [];
        saveTasteProfile();
        saveTasteSeenKeys();
        quizStep = 0;
        renderConsigliatiSection();
    }

    function generiIdPerTipo(genreKeys, tipo) {
        const ids = [];
        genreKeys.forEach(key => {
            const concetto = GENRE_CONCEPTS[key];
            if (concetto && concetto[tipo]) {
                ids.push(...concetto[tipo]);
            }
        });
        return Array.from(new Set(ids));
    }

    async function caricaConsigliati(reset = false) {
        const container = document.getElementById('consigliatiContent');
        if (reset) {
            container.innerHTML = '<div class="status-msg">Cerchiamo titoli in base ai tuoi gusti...</div>';
        }

        const tipiDaCercare = tasteProfile.type === 'both' ? ['movie', 'tv'] : [tasteProfile.type];
        const lingue = tasteProfile.languages && tasteProfile.languages.length ? tasteProfile.languages : [null];

        let sortBy = 'popularity.desc';
        let voteCountMin = 50;
        if (tasteProfile.popolarita === 'blockbuster') {
            voteCountMin = 300;
        } else if (tasteProfile.popolarita === 'nicchia') {
            sortBy = 'vote_average.desc';
            voteCountMin = 15;
        }

        let risultatiTrovati = [];

        try {
            for (const tipo of tipiDaCercare) {
                const genreIds = generiIdPerTipo(tasteProfile.genreKeys, tipo);
                const avoidIds = generiIdPerTipo(tasteProfile.avoidGenreKeys, tipo);
                const dateField = tipo === 'movie' ? 'primary_release_date' : 'first_air_date';

                for (const lingua of lingue) {
                    const pagina = Math.floor(Math.random() * 5) + 1;
                    let url = `https://api.themoviedb.org/3/discover/${tipo}?api_key=${API_KEY}&language=${currentLanguage}&sort_by=${sortBy}&vote_count.gte=${voteCountMin}&page=${pagina}`;
                    if (genreIds.length) url += `&with_genres=${genreIds.join('|')}`;
                    if (avoidIds.length) url += `&without_genres=${avoidIds.join(',')}`;
                    if (tasteProfile.voteMin) url += `&vote_average.gte=${tasteProfile.voteMin}`;
                    if (tasteProfile.yearMin) url += `&${dateField}.gte=${tasteProfile.yearMin}-01-01`;
                    if (tasteProfile.yearMax) url += `&${dateField}.lte=${tasteProfile.yearMax}-12-31`;
                    if (tipo === 'movie' && tasteProfile.runtimeMin !== null) url += `&with_runtime.gte=${tasteProfile.runtimeMin}`;
                    if (tipo === 'movie' && tasteProfile.runtimeMax !== null) url += `&with_runtime.lte=${tasteProfile.runtimeMax}`;
                    if (lingua) url += `&with_original_language=${lingua}`;
                    if (tasteProfile.platformIds && tasteProfile.platformIds.length) {
                        url += `&with_watch_providers=${tasteProfile.platformIds.join('|')}&watch_region=IT`;
                    }
                    if (tasteProfile.certificationMax) {
                        url += `&certification_country=US&certification.lte=${tasteProfile.certificationMax}`;
                    }
                    if (tipo === 'tv' && tasteProfile.tvType !== null && tasteProfile.tvType !== undefined) {
                        url += `&with_type=${tasteProfile.tvType}`;
                    }

                    const res = await tmdbFetch(url);
                    if (!res.ok) continue;
                    const data = await res.json();
                    const results = (data.results || []).map(item => ({ ...item, type: tipo }));
                    risultatiTrovati = risultatiTrovati.concat(results);
                }
            }
        } catch {
            container.innerHTML = '<div class="status-msg">Errore nel caricamento dei consigli. Riprova più tardi.</div>';
            return;
        }

        // Rimuove eventuali duplicati (stesso titolo trovato in più query)
        const vistiInQuestoGiro = new Set();
        risultatiTrovati = risultatiTrovati.filter(item => {
            const key = getContinueKey(item);
            if (vistiInQuestoGiro.has(key)) return false;
            vistiInQuestoGiro.add(key);
            return true;
        });

        const nuovi = risultatiTrovati.filter(item => !tasteSeenKeys.includes(getContinueKey(item)));

        if (!nuovi.length) {
            if (reset) {
                consigliatiCache = [];
                container.innerHTML = '<div class="favorites-empty">Non abbiamo altri titoli nuovi per i tuoi gusti al momento. Riprova tra poco o rifai il quiz.</div>';
            } else {
                mostraToast('Nessun altro consiglio nuovo al momento, riprova più tardi.');
            }
            return;
        }

        const daMostrare = nuovi.slice(0, 12);
        daMostrare.forEach(item => tasteSeenKeys.push(getContinueKey(item)));
        saveTasteSeenKeys();

        if (reset) {
            consigliatiCache = daMostrare;
        } else {
            consigliatiCache = consigliatiCache.concat(daMostrare);
        }

        renderConsigliatiGrid();
    }

    function renderConsigliatiGrid() {
        const container = document.getElementById('consigliatiContent');
        container.innerHTML = '';

        const grid = document.createElement('div');
        grid.className = 'consigliati-grid';

        consigliatiCache.forEach(item => {
            const card = document.createElement('div');
            card.className = 'card-item';
            card.tabIndex = 0;

            const posterPath = item.poster_path
                ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                : POSTER_PLACEHOLDER;

            const img = document.createElement('img');

            img.loading = 'lazy';

            img.decoding = 'async';
            img.className = 'card-img';
            img.src = posterPath;
            img.alt = item.title || item.name || '';

            const info = document.createElement('div');
            info.className = 'card-info';
            const titleEl = document.createElement('div');
            titleEl.className = 'card-title';
            titleEl.textContent = item.title || item.name || '';
            info.appendChild(titleEl);

            card.appendChild(img);
            card.appendChild(info);
            card.onclick = () => {
                if (currentType !== item.type) {
                    currentType = item.type;
                    document.getElementById('btnMovie').classList.toggle('active', currentType === 'movie');
                    document.getElementById('btnTv').classList.toggle('active', currentType === 'tv');
                    document.getElementById('episodesFrame').classList.toggle('active', currentType === 'tv');
                    renderGenreTags();
                }
                popupStack = [];
                aggiornaStatoChiusuraRecModal();
                aggiornaHeroDaItem(item);
            };
            grid.appendChild(card);
        });

        container.appendChild(grid);

        const moreContainer = document.createElement('div');
        moreContainer.className = 'consigliati-more-container';
        const moreBtn = document.createElement('button');
        moreBtn.type = 'button';
        moreBtn.className = 'btn-load-more-consigliati';
        moreBtn.textContent = 'Altri consigli';
        moreBtn.onclick = () => caricaConsigliati(false);
        moreContainer.appendChild(moreBtn);
        container.appendChild(moreContainer);
    }

    function setView(view) {
        currentView = view;

        const homeBtn = document.getElementById('homeViewBtn');
        const favoritesBtn = document.getElementById('favoritesViewBtn');
        const platformsBtn = document.getElementById('platformsViewBtn');
        const continueBtn = document.getElementById('continueViewBtn');
        const consigliatiBtn = document.getElementById('consigliatiViewBtn');
        const favoritesSection = document.getElementById('favoritesSection');
        const popularSection = document.getElementById('popularSection');
        const platformsSection = document.getElementById('platformsSection');
        const continueSection = document.getElementById('continueSection');
        const consigliatiSection = document.getElementById('consigliatiSection');

        // Update button states
        [homeBtn, favoritesBtn, platformsBtn, continueBtn, consigliatiBtn].forEach(btn => btn.classList.remove('active'));
        
        if (view === 'home') {
            homeBtn.classList.add('active');
            const searchInput = document.getElementById('searchInput');
            if (searchInput && searchInput.value.trim()) {
                searchInput.value = '';
                isSearchMode = false;
                caricaPopolari(true);
            }
        } else if (view === 'favorites') {
            favoritesBtn.classList.add('active');
        } else if (view === 'platforms') {
            platformsBtn.classList.add('active');
        } else if (view === 'continue') {
            continueBtn.classList.add('active');
        } else if (view === 'consigliati') {
            consigliatiBtn.classList.add('active');
        }

        const sectionsNascoste = ['favorites', 'platforms', 'continue', 'consigliati'];

        // Show/hide sections
        if (favoritesSection) {
            favoritesSection.style.display = view === 'favorites' ? 'flex' : 'none';
        }

        if (continueSection) {
            continueSection.style.display = view === 'continue' ? 'flex' : 'none';
        }

        if (consigliatiSection) {
            consigliatiSection.style.display = view === 'consigliati' ? 'flex' : 'none';
        }

        if (popularSection) {
            popularSection.style.display = sectionsNascoste.includes(view) ? 'none' : 'flex';
        }

        if (platformsSection) {
            platformsSection.classList.toggle('is-open', view === 'platforms');
        }

        // Load content for specific views
        if (view === 'favorites') {
            renderFavoritesSection();
        } else if (view === 'platforms') {
            renderPlatformTabs();
            loadPlatformContent(currentPlatformId);
        } else if (view === 'continue') {
            renderContinueSection();
        } else if (view === 'consigliati') {
            renderConsigliatiSection();
        }
    }

    function renderPlatformTabs() {
        const container = document.getElementById('platformTabs');
        container.innerHTML = '';
        PLATFORMS.forEach(platform => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'platform-tab' + (platform.id === currentPlatformId ? ' active' : '');
            btn.textContent = platform.name;
            btn.tabIndex = 0;
            btn.onclick = () => {
                currentPlatformId = platform.id;
                renderPlatformTabs();
                loadPlatformContent(platform.id);
            };
            container.appendChild(btn);
        });
    }

    async function loadPlatformContent(providerId) {
        const grid = document.getElementById('platformGrid');
        grid.innerHTML = '<div class="status-msg">Caricamento classifica...</div>';

        const cacheKey = `${providerId}_${currentType}`;
        if (platformDataCache[cacheKey]) {
            renderPlatformGrid(platformDataCache[cacheKey]);
            return;
        }

        try {
            const url = `https://api.themoviedb.org/3/discover/${currentType}?api_key=${API_KEY}&language=${currentLanguage}&sort_by=popularity.desc&with_watch_providers=${providerId}&watch_region=IT&vote_count.gte=10&page=1`;
            const res = await tmdbFetch(url);
            if (!res.ok) throw new Error('API error');
            const data = await res.json();
            const results = (data.results || []).slice(0, 10);
            platformDataCache[cacheKey] = results;
            renderPlatformGrid(results);
        } catch (err) {
            const errDiv = montaStatusMsg('Errore nel caricamento. Riprova più tardi.');
            grid.innerHTML = '';
            grid.appendChild(errDiv);
        }
    }

    function renderPlatformGrid(items) {
        const grid = document.getElementById('platformGrid');
        if (!items.length) {
            grid.innerHTML = '<div class="status-msg">Nessun titolo trovato per questa piattaforma.</div>';
            return;
        }

        grid.innerHTML = '';
        items.forEach((item, index) => {
            const card = document.createElement('div');
            card.className = 'card-item';
            card.tabIndex = 0;

            const rank = document.createElement('div');
            rank.className = 'platform-rank';
            rank.textContent = index + 1;

            const posterPath = item.poster_path
                ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
                : POSTER_PLACEHOLDER;

            const img = document.createElement('img');

            img.loading = 'lazy';

            img.decoding = 'async';
            img.className = 'card-img';
            img.src = posterPath;
            img.alt = currentType === 'movie' ? (item.title || '') : (item.name || '');

            const cardInfo = document.createElement('div');
            cardInfo.className = 'card-info';
            const titleEl = document.createElement('div');
            titleEl.className = 'card-title';
            titleEl.textContent = currentType === 'movie' ? (item.title || '') : (item.name || '');

            cardInfo.appendChild(titleEl);
            card.appendChild(rank);
            card.appendChild(img);
            card.appendChild(cardInfo);

            card.onclick = () => {
                const idx = risultatiRicerca.length;
                risultatiRicerca.push(item);
                aggiornaHero(idx);
            };

            grid.appendChild(card);
        });
    }

    function renderGenreTags() {
        const bar = document.getElementById('genreBar');
        bar.innerHTML = '';
        (GENRES_BY_TYPE[currentType] || []).forEach(genre => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'genre-tag' + (selectedGenreId === genre.id ? ' active' : '');
            btn.textContent = genre.label;
            btn.tabIndex = 0;
            btn.onclick = () => setGenreFilter(genre.id);
            bar.appendChild(btn);
        });
    }

    function setGenreFilter(genreId) {
        selectedGenreId = genreId;
        renderGenreTags();
        if (window.innerWidth <= 900) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            sidebar?.classList.remove('is-open');
            overlay?.classList.remove('is-open');
        }
        ricaricaLista(true);
    }

    function renderProviderTags() {
        const bar = document.getElementById('providerBar');
        if (!bar) return;
        bar.innerHTML = '';
        STREAMING_PROVIDERS.forEach(provider => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'genre-tag provider-tag' + (selectedProviderId === provider.id ? ' active' : '');
            if (provider.id !== null) {
                const dot = document.createElement('span');
                dot.className = 'provider-dot';
                dot.style.background = provider.color;
                btn.appendChild(dot);
            }
            const label = document.createElement('span');
            label.textContent = provider.label;
            btn.appendChild(label);
            btn.tabIndex = 0;
            btn.onclick = () => setProviderFilter(provider.id);
            bar.appendChild(btn);
        });
    }

    function setProviderFilter(providerId) {
        selectedProviderId = providerId;
        renderProviderTags();
        if (window.innerWidth <= 900) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            sidebar?.classList.remove('is-open');
            overlay?.classList.remove('is-open');
        }
        ricaricaLista(true);
    }

    function updateYearSliderUI() {
        const minInput = document.getElementById('yearMinInput');
        const maxInput = document.getElementById('yearMaxInput');
        const rangeEl = document.getElementById('yearSliderRange');
        if (!minInput || !maxInput || !rangeEl) return;
        document.getElementById('yearMinLabel').textContent = minInput.value;
        document.getElementById('yearMaxLabel').textContent = maxInput.value;
        const span = YEAR_MAX - YEAR_MIN;
        const minPct = ((minInput.value - YEAR_MIN) / span) * 100;
        const maxPct = ((maxInput.value - YEAR_MIN) / span) * 100;
        rangeEl.style.left = minPct + '%';
        rangeEl.style.width = Math.max(0, maxPct - minPct) + '%';
    }

    function initYearSlider() {
        const minInput = document.getElementById('yearMinInput');
        const maxInput = document.getElementById('yearMaxInput');
        if (!minInput || !maxInput) return;
        minInput.min = YEAR_MIN; minInput.max = YEAR_MAX; minInput.value = YEAR_MIN;
        maxInput.min = YEAR_MIN; maxInput.max = YEAR_MAX; maxInput.value = YEAR_MAX;
        updateYearSliderUI();

        minInput.addEventListener('input', () => {
            if (parseInt(minInput.value, 10) > parseInt(maxInput.value, 10) - 1) {
                minInput.value = parseInt(maxInput.value, 10) - 1;
            }
            selectedYearMin = parseInt(minInput.value, 10);
            updateYearSliderUI();
        });
        maxInput.addEventListener('input', () => {
            if (parseInt(maxInput.value, 10) < parseInt(minInput.value, 10) + 1) {
                maxInput.value = parseInt(minInput.value, 10) + 1;
            }
            selectedYearMax = parseInt(maxInput.value, 10);
            updateYearSliderUI();
        });
        minInput.addEventListener('change', () => ricaricaLista(true));
        maxInput.addEventListener('change', () => ricaricaLista(true));
    }

    function resetFiltri() {
        selectedGenreId = null;
        selectedProviderId = null;
        selectedYearMin = YEAR_MIN;
        selectedYearMax = YEAR_MAX;
        const minInput = document.getElementById('yearMinInput');
        const maxInput = document.getElementById('yearMaxInput');
        if (minInput) minInput.value = YEAR_MIN;
        if (maxInput) maxInput.value = YEAR_MAX;
        updateYearSliderUI();
        renderGenreTags();
        renderProviderTags();
        ricaricaLista(true);
    }

    function hasActiveDiscoverFilters() {
        return !!selectedGenreId || !!selectedProviderId || selectedYearMin !== YEAR_MIN || selectedYearMax !== YEAR_MAX || currentSort !== 'popolarita';
    }

    function mudaOrdenacao(value) {
        currentSort = SORT_LABELS[value] ? value : 'popolarita';
        ricaricaLista(true);
    }

    function buildFilterBadge() {
        const parts = [];
        if (selectedGenreId) parts.push(getGenreLabel(selectedGenreId, currentType));
        if (selectedProviderId) parts.push(getProviderLabel(selectedProviderId));
        if (selectedYearMin !== YEAR_MIN || selectedYearMax !== YEAR_MAX) {
            parts.push(`${selectedYearMin}-${selectedYearMax}`);
        }
        return parts.length ? ` · ${parts.join(' · ')}` : '';
    }

    function aggiornaTitoloGriglia() {
        const query = document.getElementById('searchInput').value.trim();
        const tipo = currentType === 'movie' ? 'Film' : 'Serie TV';
        if (query) {
            const badge = selectedGenreId ? ` · ${getGenreLabel(selectedGenreId, currentType)}` : '';
            document.getElementById('gridTitle').innerText = `Risultati per "${query}"${badge}`;
            return;
        }
        if (hasActiveDiscoverFilters()) {
            document.getElementById('gridTitle').innerText = `${tipo}${buildFilterBadge()}`;
            return;
        }
        document.getElementById('gridTitle').innerText = `Popolari del momento (${tipo})`;
    }

    function ricaricaLista(reset = true) {
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            cerca(reset);
        } else if (hasActiveDiscoverFilters()) {
            caricaConFiltri(reset);
        } else {
            caricaPopolari(reset);
        }
    }

    function assicuraVistaHomePerRicerca() {
        if (currentView === 'home') return;
        currentView = 'home';

        document.getElementById('homeViewBtn')?.classList.add('active');
        document.getElementById('favoritesViewBtn')?.classList.remove('active');
        document.getElementById('platformsViewBtn')?.classList.remove('active');

        const favoritesSection = document.getElementById('favoritesSection');
        const popularSection = document.getElementById('popularSection');
        const platformsSection = document.getElementById('platformsSection');
        if (favoritesSection) favoritesSection.style.display = 'none';
        if (popularSection) popularSection.style.display = 'flex';
        if (platformsSection) platformsSection.classList.remove('is-open');
    }

    function onInputSearch() {
        const query = document.getElementById('searchInput').value.trim();
        aggiornaVisibilitaClearRicerca();

        if (query) {
            assicuraVistaHomePerRicerca();
        }

        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            cerca(true);
        }, SEARCH_DEBOUNCE_MS);
    }

    function aggiornaVisibilitaClearRicerca() {
        const input = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClearBtn');
        if (input && clearBtn) {
            clearBtn.classList.toggle('is-visible', input.value.trim().length > 0);
        }
    }

    function pulisciRicerca() {
        const input = document.getElementById('searchInput');
        if (!input) return;
        input.value = '';
        input.focus();
        aggiornaVisibilitaClearRicerca();
        clearTimeout(debounceTimer);
        cerca(true);
    }

    function cercaImmediata() {
        const query = document.getElementById('searchInput').value.trim();
        if (query) {
            assicuraVistaHomePerRicerca();
        }
        clearTimeout(debounceTimer);
        cerca(true);
    }

    // --- Tasto "Random": pesca un titolo casuale da tutto il catalogo TMDB ---
    // (non solo tra quelli già caricati a schermo), adattandosi alla sezione corrente.

    function setRandomButtonLoading(isLoading) {
        const btn = document.getElementById('randomBtn');
        if (!btn) return;
        btn.disabled = isLoading;
        btn.classList.toggle('is-loading', isLoading);
    }

    async function estraiTitoloCasualeDaDiscover(extraParams = '') {
        const baseUrl = `https://api.themoviedb.org/3/discover/${currentType}?api_key=${API_KEY}&language=${currentLanguage}&sort_by=popularity.desc&vote_count.gte=25${extraParams}`;

        // Prima chiamata per scoprire quante pagine ha il catalogo con questi filtri
        const primaRes = await tmdbFetch(`${baseUrl}&page=1`);
        if (!primaRes.ok) throw new Error('API discover non disponibile');
        const primaData = await primaRes.json();
        const totalPages = Math.min(primaData.total_pages || 1, 500); // limite massimo TMDB

        if (!totalPages || totalPages < 1) return null;

        const paginaCasuale = Math.max(1, Math.floor(Math.random() * totalPages) + 1);

        let results;
        if (paginaCasuale === 1) {
            results = primaData.results || [];
        } else {
            const res = await tmdbFetch(`${baseUrl}&page=${paginaCasuale}`);
            if (!res.ok) throw new Error('API discover non disponibile');
            const data = await res.json();
            results = data.results || [];
        }

        if (!results.length) return null;
        return results[Math.floor(Math.random() * results.length)];
    }

    async function apriTitoloRandom() {
        setRandomButtonLoading(true);
        try {
            let item = null;

            if (currentView === 'favorites') {
                // Nei preferiti peschiamo dalla lista personale dell'utente
                const candidati = favorites.filter(f => (f.type || currentType) === currentType);
                const pool = candidati.length ? candidati : favorites;
                if (!pool.length) {
                    mostraToast('Non hai ancora titoli nei preferiti per questo tipo.');
                    return;
                }
                item = pool[Math.floor(Math.random() * pool.length)];
            } else if (currentView === 'platforms') {
                // In Top 10 restiamo sulla piattaforma selezionata, ma peschiamo da tutto il suo catalogo IT
                item = await estraiTitoloCasualeDaDiscover(`&with_watch_providers=${currentPlatformId}&watch_region=IT&with_watch_monetization_types=flatrate`);
            } else {
                // Home: rispetta i filtri attivi in sidebar (genere, servizio, anno) su tutto il catalogo
                let params = '';
                if (selectedGenreId) params += `&with_genres=${selectedGenreId}`;
                if (selectedProviderId) params += `&with_watch_providers=${selectedProviderId}&watch_region=IT&with_watch_monetization_types=flatrate`;
                if (selectedYearMin !== YEAR_MIN || selectedYearMax !== YEAR_MAX) {
                    const campo = currentType === 'movie' ? 'primary_release_date' : 'first_air_date';
                    params += `&${campo}.gte=${selectedYearMin}-01-01&${campo}.lte=${selectedYearMax}-12-31`;
                }
                item = await estraiTitoloCasualeDaDiscover(params);
            }

            if (!item) {
                mostraToast('Nessun titolo trovato per questa combinazione di filtri.');
                return;
            }

            apriItemFresco({ ...item, type: item.type || currentType });
        } catch (err) {
            mostraToast('Impossibile trovare un titolo casuale in questo momento.', 'error');
        } finally {
            setRandomButtonLoading(false);
        }
    }

function setRecsCollapsed(collapsed) {
    const grid = document.getElementById('recsGrid');
    const btn = document.getElementById('recsToggleBtn');
    if (!grid || !btn) return;
    grid.classList.toggle('is-collapsed', collapsed);
    btn.textContent = collapsed ? 'Mostra ▾' : 'Nascondi ▴';
    btn.setAttribute('aria-expanded', String(!collapsed));
}

function toggleRecs() {
    const grid = document.getElementById('recsGrid');
    setRecsCollapsed(!grid.classList.contains('is-collapsed'));
}

async function fetchRecommendations(id, mediaType = currentType) {
    const grid = document.getElementById('recsGrid');
    const headerEl = document.getElementById('recsHeader');
    try {
        const res = await tmdbFetch(`https://api.themoviedb.org/3/${mediaType}/${id}/recommendations?api_key=${API_KEY}&language=${currentLanguage}`);
        if (!res.ok) {
            headerEl.style.display = 'none';
            grid.innerHTML = '';
            return;
        }
        const data = await res.json();
        const results = (data.results || []).slice(0, 8);
        if (results.length === 0) {
            headerEl.style.display = 'none';
            grid.innerHTML = '';
            return;
        }
        headerEl.style.display = 'flex';
        grid.innerHTML = '';
        results.forEach(item => {
            const posterPath = item.poster_path
                ? `https://image.tmdb.org/t/p/w200${item.poster_path}`
                : POSTER_PLACEHOLDER;
            const card = document.createElement('div');
            card.className = 'card-item rec-card';
            card.tabIndex = 0;
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.src = posterPath;
            img.alt = mediaType === 'movie' ? (item.title || '') : (item.name || '');
            img.style.width = '100%';
            img.style.height = '135px';
            img.style.objectFit = 'cover';
            card.appendChild(img);
            card.onclick = () => selezionaItem(item);
            grid.appendChild(card);
        });
        setRecsCollapsed(window.innerWidth <= 600);
    } catch {
        headerEl.style.display = 'none';
        grid.innerHTML = '';
    }
}

    function aggiornaStatoChiusuraRecModal() {
        const closeBtn = document.getElementById('recModalCloseBtn');
        if (!closeBtn) return;
        if (popupStack.length > 0) {
            closeBtn.innerHTML = '←';
            closeBtn.classList.add('is-back');
            closeBtn.setAttribute('aria-label', 'Torna al titolo precedente');
        } else {
            closeBtn.innerHTML = '✕';
            closeBtn.classList.remove('is-back');
            closeBtn.setAttribute('aria-label', 'Chiudi');
        }
    }

    function chiudiPopupConsigliato() {
        if (popupStack.length > 0) {
            const precedente = popupStack.pop();
            aggiornaStatoChiusuraRecModal();
            aggiornaHeroDaItem(precedente.item);
            return;
        }
        document.getElementById('recModal').classList.remove('is-open');
        restaurarFocoModal();
    }

    function selezionaItem(item) {
        if (elementoSelezionato) {
            popupStack.push({ item: elementoSelezionato });
        }
        aggiornaStatoChiusuraRecModal();
        aggiornaHeroDaItem(item);
    }

    // Apre un titolo "da zero", azzerando lo stack di navigazione dei popup:
    // usata dal tasto Random per evitare che chiudere il popup torni a quello precedente.
    function apriItemFresco(item) {
        popupStack = [];
        aggiornaStatoChiusuraRecModal();
        aggiornaHeroDaItem(item);
    }

    document.addEventListener('DOMContentLoaded', () => {
        aplicarTema(temaAtual());
        initInfiniteScroll();
        const langSelect = document.getElementById('langSelect');
        if (langSelect) langSelect.value = currentLanguage;
        // Se havia login salvo, carrega o Firebase para restaurar a sessão e o sync
        if (possuiSessaoFirebase()) {
            carregarFirebase().catch(() => {});
        }
        const searchBox = document.querySelector('.search-box');
        const searchInput = document.getElementById('searchInput');
        if (searchBox && searchInput) {
            searchInput.addEventListener('focus', () => renderHistoricoBuscas());
            document.addEventListener('click', (event) => {
                if (!searchBox.contains(event.target)) {
                    fecharHistoricoBuscas();
                }
            });
        }
        const overviewModal = document.getElementById('overviewModal');
        const overviewModalCard = document.querySelector('.overview-modal-card');
        const recModal = document.getElementById('recModal');
        const recModalCard = document.querySelector('.rec-modal-card');
        const sidebar = document.getElementById('sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebarClose = document.getElementById('sidebarClose');
        const sidebarOverlay = document.getElementById('sidebarOverlay');

        const toggleSidebar = () => {
            const isOpen = sidebar.classList.toggle('is-open');
            sidebarOverlay.classList.toggle('is-open', isOpen);
            sidebarToggle.setAttribute('aria-expanded', String(isOpen));
        };

        const closeSidebar = () => {
            sidebar.classList.remove('is-open');
            sidebarOverlay.classList.remove('is-open');
            sidebarToggle.setAttribute('aria-expanded', 'false');
        };

        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', toggleSidebar);
        }
        if (sidebarClose) {
            sidebarClose.addEventListener('click', closeSidebar);
        }
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', closeSidebar);
        }
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const modal = modalAberto();
                if (modal) {
                    if (modal.id === 'recModal') chiudiPopupConsigliato();
                    else if (modal.id === 'overviewModal') chiudiTramaModal();
                    else if (modal.id === 'progressModal') chiudiProgressoModal();
                    else if (modal.id === 'authModal') chiudiModaleAccount();
                    else if (modal.id === 'trailerModal') chiudiTrailerModal();
                    else if (modal.id === 'playerModal') chiudiPlayerModal();
                    return;
                }
                closeSidebar();
                return;
            }
            if (event.key === 'Tab') {
                const modal = modalAberto();
                if (!modal) return;
                const foco = Array.from(modal.querySelectorAll(
                    'button, [href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])'
                )).filter((el) => el.offsetParent !== null);
                if (!foco.length) return;
                const primeiro = foco[0];
                const ultimo = foco[foco.length - 1];
                if (event.shiftKey && document.activeElement === primeiro) {
                    event.preventDefault();
                    ultimo.focus();
                } else if (!event.shiftKey && document.activeElement === ultimo) {
                    event.preventDefault();
                    primeiro.focus();
                }
            }
        });

        const authModal = document.getElementById('authModal');
        const authModalCard = document.querySelector('.auth-modal-card');
        if (authModal) {
            authModal.addEventListener('click', (event) => {
                if (event.target === authModal) {
                    chiudiModaleAccount();
                }
            });
        }
        if (authModalCard) {
            authModalCard.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        overviewModal.addEventListener('click', (event) => {
            if (event.target === overviewModal) {
                chiudiTramaModal();
            }
        });

        if (overviewModalCard) {
            overviewModalCard.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }

        recModal.addEventListener('click', (event) => {
            if (event.target === recModal) {
                chiudiPopupConsigliato();
            }
        });

        recModalCard.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        const progressModal = document.getElementById('progressModal');
        const progressModalCard = document.querySelector('.progress-modal-card');
        if (progressModal) {
            progressModal.addEventListener('click', (event) => {
                if (event.target === progressModal) {
                    chiudiProgressoModal();
                }
            });
        }
        if (progressModalCard) {
            progressModalCard.addEventListener('click', (event) => {
                event.stopPropagation();
            });
        }
    });
    function nascondiSplashScreen() {
        const splash = document.getElementById('splashScreen');
        if (!splash || splash.classList.contains('is-hidden')) return;
        splash.classList.add('is-hidden');
        setTimeout(() => splash.remove(), 600);
    }

    window.onload = () => {
        loadFavorites();
        renderFavoritesSection();
        loadContinueWatching();
        loadTasteProfile();
        renderGenreTags();
        renderProviderTags();
        initYearSlider();

        // Timeout di sicurezza: se il caricamento è lento, la splash sparisce comunque dopo 4s
        const splashSafetyTimeout = setTimeout(nascondiSplashScreen, 4000);

        caricaPopolari(true).finally(() => {
            clearTimeout(splashSafetyTimeout);
            nascondiSplashScreen();
        });
    };

    function handleLogoError() {
        document.getElementById('logoImg').style.display = 'none';
        document.getElementById('logoText').style.display = 'inline-block';
    }

    function setType(type) {
        currentType = type;
        document.getElementById('btnMovie').classList.toggle('active', type === 'movie');
        document.getElementById('btnTv').classList.toggle('active', type === 'tv');
        
        const frame = document.getElementById('episodesFrame');
        if (type === 'tv') {
            frame.classList.add('active');
        } else {
            frame.classList.remove('active');
        }

        selectedGenreId = null;
        renderGenreTags();
        if (window.innerWidth <= 900) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            sidebar?.classList.remove('is-open');
            overlay?.classList.remove('is-open');
        }

        if (currentView !== 'home') {
            setView('home');
        }

        const query = document.getElementById('searchInput').value.trim();
        if (!query) {
            caricaPopolari(true);
        } else {
            cerca(true);
        }
    }

    function creaCard(item) {
        const card = document.createElement('div');
        card.className = 'card-item';
        card.tabIndex = 0;

        const posterPath = item.poster_path 
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : POSTER_PLACEHOLDER;

        const img = document.createElement('img');

        img.loading = 'lazy';

        img.decoding = 'async';
        img.className = 'card-img';
        img.src = posterPath;
        img.alt = currentType === 'movie' ? (item.title || '') : (item.name || '');

        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';
        const titleEl = document.createElement('div');
        titleEl.className = 'card-title';
        titleEl.textContent = currentType === 'movie' ? (item.title || '') : (item.name || '');

        cardInfo.appendChild(titleEl);
        card.appendChild(img);
        card.appendChild(cardInfo);
        return card;
    }

    async function caricaPopolari(reset = false) {
        isSearchMode = false;
        if (reset) {
            currentPage = 1;
            risultatiRicerca = [];
            mostraSkeleton();
        }
        aggiornaTitoloGriglia();

        await fetchEPopola(`https://api.themoviedb.org/3/trending/${currentType}/week?api_key=${API_KEY}&language=${currentLanguage}&page=${currentPage}`, reset);
        currentPage++;
        await fetchEPopola(`https://api.themoviedb.org/3/trending/${currentType}/week?api_key=${API_KEY}&language=${currentLanguage}&page=${currentPage}`, false);

        impostaMaisResultados();
    }

    function costruisciDiscoverUrl(page) {
        let sortBy = 'popularity.desc';
        if (currentSort === 'voto') {
            sortBy = 'vote_average.desc';
        } else if (currentSort === 'recente') {
            sortBy = currentType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';
        }

        let url = `https://api.themoviedb.org/3/discover/${currentType}?api_key=${API_KEY}&language=${currentLanguage}&sort_by=${sortBy}&page=${page}`;

        if (currentSort === 'voto') {
            // Evita títulos com poucos votos no topo da ordenação por nota
            url += '&vote_count.gte=100';
        }

        if (selectedGenreId) {
            url += `&with_genres=${selectedGenreId}`;
        }

        if (selectedProviderId) {
            // Catalogo italiano: watch_region=IT, dati provider sourced da JustWatch tramite TMDB
            url += `&with_watch_providers=${selectedProviderId}&watch_region=IT&with_watch_monetization_types=flatrate`;
        }

        if (selectedYearMin !== YEAR_MIN || selectedYearMax !== YEAR_MAX) {
            const campo = currentType === 'movie' ? 'primary_release_date' : 'first_air_date';
            url += `&${campo}.gte=${selectedYearMin}-01-01&${campo}.lte=${selectedYearMax}-12-31`;
        }

        return url;
    }

    async function caricaConFiltri(reset = false) {
        isSearchMode = false;
        if (reset) {
            currentPage = 1;
            risultatiRicerca = [];
            mostraSkeleton();
        }
        aggiornaTitoloGriglia();

        await fetchEPopola(costruisciDiscoverUrl(currentPage), reset);
        currentPage++;
        await fetchEPopola(costruisciDiscoverUrl(currentPage), false);

        impostaMaisResultados();
    }

    async function cercaConPersone(query, page = 1) {
        const yearMatch = query.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? yearMatch[0] : null;
        const titleUrl = `https://api.themoviedb.org/3/search/${currentType}?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=${currentLanguage}&page=${page}`;
        const peopleUrl = `https://api.themoviedb.org/3/search/person?api_key=${API_KEY}&query=${encodeURIComponent(query)}&language=${currentLanguage}&page=${page}`;
        const yearUrl = year
            ? `https://api.themoviedb.org/3/discover/${currentType}?api_key=${API_KEY}&language=${currentLanguage}&sort_by=popularity.desc&page=${page}&${currentType === 'movie' ? 'primary_release_year' : 'first_air_date_year'}=${year}`
            : null;

        const requests = [fetch(titleUrl), fetch(peopleUrl)];
        if (yearUrl) requests.push(fetch(yearUrl));

        const [titleRes, peopleRes, yearRes] = await Promise.all(requests);

        const titleData = titleRes.ok ? await titleRes.json() : { results: [] };
        const peopleData = peopleRes.ok ? await peopleRes.json() : { results: [] };
        const yearData = yearRes?.ok ? await yearRes.json() : { results: [] };

        const combinedResults = [...(titleData.results || [])];
        const seen = new Set(combinedResults.map(item => `${item.id}-${currentType}`));

        const relevantPeople = (peopleData.results || []).filter(person =>
            person && ['Acting', 'Directing'].includes(person.known_for_department)
        ).slice(0, 6);

        const creditsResponses = await Promise.all(relevantPeople.map(async (person) => {
            const creditsUrl = `https://api.themoviedb.org/3/person/${person.id}/${currentType === 'movie' ? 'movie' : 'tv'}_credits?api_key=${API_KEY}&language=${currentLanguage}`;
            const creditsRes = await tmdbFetch(creditsUrl);
            if (!creditsRes.ok) return [];
            const creditsData = await creditsRes.json();
            const creditItems = [...(creditsData.cast || []), ...(creditsData.crew || [])];
            return creditItems.filter(item => item && item.id && (item.title || item.name));
        }));

        creditsResponses.flat().forEach((item) => {
            const key = `${item.id}-${currentType}`;
            if (!seen.has(key)) {
                seen.add(key);
                combinedResults.push(item);
            }
        });

        (yearData.results || []).forEach((item) => {
            const key = `${item.id}-${currentType}`;
            if (!seen.has(key)) {
                seen.add(key);
                combinedResults.push(item);
            }
        });

        return combinedResults;
    }

    async function cerca(reset = false) {
        const query = document.getElementById('searchInput').value.trim();

        if (!query) {
            ricaricaLista(true);
            return;
        }

        isSearchMode = true;
        if (reset) {
            currentPage = 1;
            risultatiRicerca = [];
            selectedGenreId = null;
            renderGenreTags();
            salvarBuscaNoHistorico(query);
            mostraSkeleton();
        }
        aggiornaTitoloGriglia();

        const firstResults = await cercaConPersone(query, currentPage);
        await fetchEPopola(firstResults, reset, null);
        currentPage++;
        const secondResults = await cercaConPersone(query, currentPage);
        await fetchEPopola(secondResults, false, null);

        impostaMaisResultados();
    }

    async function caricaAltriRisultati() {
        currentPage++;
        const query = document.getElementById('searchInput').value.trim();
        if (isSearchMode && query) {
            const results = await cercaConPersone(query, currentPage);
            await fetchEPopola(results, false, null);
        } else if (hasActiveDiscoverFilters()) {
            await fetchEPopola(costruisciDiscoverUrl(currentPage), false);
        } else {
            const url = `https://api.themoviedb.org/3/trending/${currentType}/week?api_key=${API_KEY}&language=${currentLanguage}&page=${currentPage}`;
            await fetchEPopola(url, false);
        }
    }

    let isLoadingMore = false;

    async function caricaAltriRisultatiAutomatico() {
        if (isLoadingMore) return;
        const btn = document.getElementById('btnLoadMore');
        if (btn && btn.style.display === 'none') return;
        isLoadingMore = true;
        try {
            await caricaAltriRisultati();
        } catch (e) {
            // silencioso: o sentinel tenta de novo na próxima rolagem
        } finally {
            isLoadingMore = false;
        }
    }

    function initInfiniteScroll() {
        const sentinel = document.getElementById('scrollSentinel');
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some(e => e.isIntersecting)) {
                caricaAltriRisultatiAutomatico();
            }
        }, { rootMargin: '400px' });
        observer.observe(sentinel);
    }

    async function fetchEPopola(input, resetGrid = false, genreFilter = null) {
        const listContainer = document.getElementById('resultsList');

        try {
            let results = [];

            if (Array.isArray(input)) {
                results = input;
            } else {
                const response = await tmdbFetch(input);
                if (!response.ok) {
                    throw new Error(`API ${response.status}`);
                }
                const data = await response.json();
                results = data.results || [];
            }

            if (genreFilter) {
                results = results.filter(item => (item.genre_ids || []).includes(genreFilter));
            }

            if (resetGrid) {
                listContainer.innerHTML = '';
            }

            if (results.length === 0 && risultatiRicerca.length === 0) {
                listContainer.innerHTML = '<div class="status-msg">Nessun contenuto trovato.</div>';
                impostaFimResultados();
                return;
            }

            if (results.length === 0) {
                impostaFimResultados();
                return;
            }

            const startIndex = risultatiRicerca.length;

            results.forEach((item) => {
                risultatiRicerca.push(item);
                const currentIndex = risultatiRicerca.length - 1;

                const nome = currentType === 'movie' ? item.title : item.name;

                const card = creaCard({
                    poster_path: item.poster_path,
                    title: item.title,
                    name: item.name
                });
                card.tabIndex = 0;

                const titleEl = card.querySelector('.card-title');
                titleEl.textContent = nome || '';

                card.onclick = () => {
                    aggiornaHero(currentIndex);
                    document.getElementById('btnPlay').focus();
                };

                card.onkeydown = (e) => {
                    if (e.key === 'Enter' || e.keyCode === 13) {
                        aggiornaHero(currentIndex);
                        document.getElementById('btnPlay').focus();
                    }
                };

                const delayIndex = currentIndex - startIndex;
                if (delayIndex <= 14) {
                    card.style.animationDelay = `${delayIndex * 35}ms`;
                }

                listContainer.appendChild(card);
            });

        } catch (err) {
            if (risultatiRicerca.length === 0) {
                const errDiv = montaStatusMsg('Errore di connessione. Controlla la rete e riprova.');
                listContainer.innerHTML = '';
                listContainer.appendChild(errDiv);
            }
        }
    }

    async function aggiornaSelectSerie(tvItem) {
        const seasonSelect = document.getElementById('seasonInput');
        const episodeSelect = document.getElementById('episodeInput');

        if (!tvItem || currentType !== 'tv') {
            seasonSelect.innerHTML = '';
            episodeSelect.innerHTML = '';
            return;
        }

        let seasonsData = Array.isArray(tvItem.seasons) ? tvItem.seasons : [];

        if (!seasonsData.length) {
            try {
                const res = await tmdbFetch(`https://api.themoviedb.org/3/tv/${tvItem.id}?api_key=${API_KEY}&language=${currentLanguage}`);
                if (res.ok) {
                    const detail = await res.json();
                    seasonsData = Array.isArray(detail.seasons) ? detail.seasons : [];
                }
            } catch {
                seasonsData = [];
            }
        }

        const seasonCount = Math.max(1, seasonsData.length || tvItem.number_of_seasons || 1);
        const seasonOptions = [];
        for (let s = 1; s <= seasonCount; s++) {
            const seasonInfo = seasonsData.find(entry => entry.season_number === s);
            const epCount = seasonInfo?.episode_count || 1;
            seasonOptions.push(`<option value="${s}">${s}${epCount ? ` (${epCount} ep)` : ''}</option>`);
        }
        seasonSelect.innerHTML = seasonOptions.join('');
        seasonSelect.value = '1';

        const aggiornaEpisodi = async (selectedSeason) => {
            const seasonInfo = seasonsData.find(entry => entry.season_number === selectedSeason);
            const fallbackCount = Math.max(1, seasonInfo?.episode_count || 1);

            episodeSelect.innerHTML = `<option value="1">Caricamento...</option>`;

            let episodesData = [];
            try {
                const res = await tmdbFetch(`https://api.themoviedb.org/3/tv/${tvItem.id}/season/${selectedSeason}?api_key=${API_KEY}&language=${currentLanguage}`);
                if (res.ok) {
                    const seasonDetail = await res.json();
                    episodesData = Array.isArray(seasonDetail.episodes) ? seasonDetail.episodes : [];
                }
            } catch {
                episodesData = [];
            }

            const episodeCount = Math.max(1, episodesData.length || fallbackCount);
            const episodeOptions = [];
            for (let e = 1; e <= episodeCount; e++) {
                const episodeInfo = episodesData.find(entry => entry.episode_number === e);
                const durata = episodeInfo?.runtime ? ` · ${formatRuntime(episodeInfo.runtime)}` : '';
                episodeOptions.push(`<option value="${e}">${e}${durata}</option>`);
            }
            episodeSelect.innerHTML = episodeOptions.join('');
            episodeSelect.value = '1';
        };

        seasonSelect.onchange = () => {
            aggiornaEpisodi(parseInt(seasonSelect.value || '1', 10));
        };

        await aggiornaEpisodi(1);
    }

    async function aggiornaHeroDaItem(item) {
        elementoSelezionato = item;
        if (!elementoSelezionato) return;

        const recModalEl = document.getElementById('recModal');
        const eraGiaAperto = recModalEl.classList.contains('is-open');
        if (!eraGiaAperto) registrarFocoModal();
        recModalEl.classList.add('is-open');

        if (eraGiaAperto) {
            const recModalCardEl = document.querySelector('.rec-modal-card');
            if (recModalCardEl) {
                recModalCardEl.classList.remove('rec-modal-card-swap');
                void recModalCardEl.offsetWidth;
                recModalCardEl.classList.add('rec-modal-card-swap');
            }
        }

        const mediaType = elementoSelezionato.type || currentType;
        const nome = mediaType === 'movie' ? elementoSelezionato.title : elementoSelezionato.name;
        const dataUscita = mediaType === 'movie' ? elementoSelezionato.release_date : elementoSelezionato.first_air_date;
        const anno = dataUscita ? dataUscita.substring(0, 4) : 'N/D';
        const voto = elementoSelezionato.vote_average ? `★ ${elementoSelezionato.vote_average.toFixed(1)}/10` : '';

        document.getElementById('heroTitle').innerText = nome;
        document.getElementById('heroOverview').innerText = elementoSelezionato.overview || 'Nessuna descrizione disponibile.';

        let runtimeMinutiRilevato = null;
        try {
            const detailRes = await tmdbFetch(`https://api.themoviedb.org/3/${mediaType}/${elementoSelezionato.id}?api_key=${API_KEY}&language=${currentLanguage}`);
            if (detailRes.ok) {
                const details = await detailRes.json();
                const runtime = mediaType === 'movie' ? details.runtime : '';
                runtimeMinutiRilevato = runtime || null;
                const countries = formatCountries(details.production_countries || [], LINGUAS[currentLanguage].locale);
                const detailsMeta = [anno, voto, runtime ? formatRuntime(runtime) : '', countries].filter(Boolean);
                document.getElementById('heroMeta').innerText = detailsMeta.join(' • ');
            } else {
                document.getElementById('heroMeta').innerText = `${anno} • ${voto}`;
            }
        } catch {
            document.getElementById('heroMeta').innerText = `${anno} • ${voto}`;
        }

        const posterPath = elementoSelezionato.poster_path
            ? `https://image.tmdb.org/t/p/w342${elementoSelezionato.poster_path}`
            : POSTER_PLACEHOLDER;
        document.getElementById('heroPoster').src = posterPath;

        if (mediaType === 'tv') {
            await aggiornaSelectSerie(elementoSelezionato);
        } else {
            document.getElementById('seasonInput').innerHTML = '';
            document.getElementById('episodeInput').innerHTML = '';
        }

        updateFavoriteButton(elementoSelezionato);
        elementoSelezionato.type = mediaType;
        aggiornaProgressoButton(elementoSelezionato, runtimeMinutiRilevato);

        fetchRecommendations(elementoSelezionato.id, mediaType);
        if (currentView === 'favorites') {
            renderFavoritesSection();
        }
    }

    async function aggiornaHero(index) {
        elementoSelezionato = risultatiRicerca[index];
        if (!elementoSelezionato) return;

        popupStack = [];
        aggiornaStatoChiusuraRecModal();
        registrarFocoModal();
        document.getElementById('recModal').classList.add('is-open');

        const selectedId = elementoSelezionato.id;
        document.querySelectorAll('#resultsList .card-item').forEach((el, i) => {
            el.classList.toggle('selected', risultatiRicerca[i]?.id === selectedId);
        });

        const item = elementoSelezionato;
        const tipoPerHero = currentType;
        const nome = tipoPerHero === 'movie' ? item.title : item.name;
        const dataUscita = tipoPerHero === 'movie' ? item.release_date : item.first_air_date;
        const anno = dataUscita ? dataUscita.substring(0, 4) : 'N/D';
        const voto = item.vote_average ? `★ ${item.vote_average.toFixed(1)}/10` : '';

        document.getElementById('heroTitle').innerText = nome;
        document.getElementById('heroOverview').innerText = item.overview || 'Nessuna descrizione disponibile.';

        let runtimeMinutiRilevato = null;
        try {
            const detailRes = await tmdbFetch(`https://api.themoviedb.org/3/${tipoPerHero}/${item.id}?api_key=${API_KEY}&language=${currentLanguage}`);
            if (detailRes.ok) {
                const details = await detailRes.json();
                const runtime = tipoPerHero === 'movie' ? details.runtime : '';
                runtimeMinutiRilevato = runtime || null;
                const countries = formatCountries(details.production_countries || [], LINGUAS[currentLanguage].locale);
                const detailsMeta = [anno, voto, runtime ? formatRuntime(runtime) : '', countries].filter(Boolean);
                document.getElementById('heroMeta').innerText = detailsMeta.join(' • ');
            } else {
                document.getElementById('heroMeta').innerText = `${anno} • ${voto}`;
            }
        } catch {
            document.getElementById('heroMeta').innerText = `${anno} • ${voto}`;
        }

        const posterPath = item.poster_path 
            ? `https://image.tmdb.org/t/p/w342${item.poster_path}`
            : POSTER_PLACEHOLDER;
        document.getElementById('heroPoster').src = posterPath;

        if (tipoPerHero === 'tv') {
            await aggiornaSelectSerie(item);
        } else {
            document.getElementById('seasonInput').innerHTML = '';
            document.getElementById('episodeInput').innerHTML = '';
        }

        updateFavoriteButton(item);
        item.type = tipoPerHero;
        aggiornaProgressoButton(item, runtimeMinutiRilevato);

        fetchRecommendations(item.id, tipoPerHero);
    }

    function apriLinkEsterno(url) {
        try {
            const popup = window.open(url, '_blank', 'noopener,noreferrer');
            if (popup) {
                popup.opener = null;
                return;
            }
        } catch {}

        try {
            const link = document.createElement('a');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch {
            mostraToast('Impossibile aprire il link automaticamente. Copia l\'indirizzo manualmente.', 'error');
        }
    }

    function riproduciInPagina(item = elementoSelezionato) {
        if (!item) {
            mostraToast('Seleziona prima un elemento!');
            return;
        }

        const tmdbId = item.id;
        let url = "";

        if (currentType === 'movie') {
            url = `https://vixsrc.to/movie/${tmdbId}/`;
        } else {
            const season = document.getElementById('seasonInput').value || '1';
            const episode = document.getElementById('episodeInput').value || '1';
            url = `https://vixsrc.to/tv/${tmdbId}/${season}/${episode}/`;
        }

        abrePlayerModal(url);
    }

    function abrePlayerModal(url) {
        // file:// non invia referrer: VixSrc rifiuta l'embed. Apre in nuova scheda (top-level: il check non scatta).
        if (window.location.protocol === 'file:') {
            window.open(url, '_blank', 'noopener,noreferrer');
            mostraToast('Aperto in una nuova scheda. Per l\'embed usa un server locale (es. python3 -m http.server) o un hosting HTTPS.', 'info');
            return;
        }
        registrarFocoModal();
        const modal = document.getElementById('playerModal');
        document.getElementById('playerFrame').src = url;
        modal.classList.add('is-open');
        const closeBtn = modal.querySelector('.player-close');
        if (closeBtn) closeBtn.focus();
    }

    function chiudiPlayerModal() {
        const modal = document.getElementById('playerModal');
        modal.classList.remove('is-open');
        document.getElementById('playerFrame').src = '';
        restaurarFocoModal();
    }

    function attivaFullscreenPlayer() {
        const modal = document.getElementById('playerModal');
        if (!modal) return;
        if (document.fullscreenElement) {
            document.exitFullscreen && document.exitFullscreen();
        } else if (modal.requestFullscreen) {
            modal.requestFullscreen();
        }
    }

    async function showTrailer(item = elementoSelezionato) {
        if (!item) return mostraToast('Seleziona prima un titolo');
        try {
            const res = await tmdbFetch(`https://api.themoviedb.org/3/${currentType}/${item.id}/videos?api_key=${API_KEY}&language=${currentLanguage}`);
            if (!res.ok) {
                mostraToast('Impossibile aprire il trailer.', 'error');
                return;
            }
            const data = await res.json();
            const videos = data.results || [];
            const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser' || v.type === 'Featurette'))
                || videos.find(v => v.site === 'YouTube')
                || null;

            if (trailer) {
                abreTrailerModal(trailer.key);
            } else {
                mostraToast('Trailer non disponibile');
            }
        } catch {
            mostraToast('Errore di connessione durante l\'apertura del trailer.', 'error');
        }
    }

    function abreTrailerModal(chave) {
        registrarFocoModal();
        const modal = document.getElementById('trailerModal');
        document.getElementById('trailerFrame').src = `https://www.youtube-nocookie.com/embed/${chave}?autoplay=1&rel=0`;
        const link = document.getElementById('trailerExternalLink');
        if (link) link.href = `https://www.youtube.com/watch?v=${chave}`;
        modal.classList.add('is-open');
        const closeBtn = modal.querySelector('.trailer-modal-close');
        if (closeBtn) closeBtn.focus();
    }

    function chiudiTrailerModal() {
        const modal = document.getElementById('trailerModal');
        modal.classList.remove('is-open');
        document.getElementById('trailerFrame').src = '';
        restaurarFocoModal();
    }

    function chiudiTramaModal() {
        document.getElementById('overviewModal').classList.remove('is-open');
        restaurarFocoModal();
    }

    async function apriTramaCompleta() {
        if (!elementoSelezionato) return;
        const modal = document.getElementById('overviewModal');
        const titleEl = document.getElementById('overviewModalTitle');
        const metaEl = document.getElementById('overviewModalMeta');
        const textEl = document.getElementById('overviewModalText');
        const castEl = document.getElementById('overviewModalCast');
        const title = currentType === 'movie' ? elementoSelezionato.title : elementoSelezionato.name;
        const text = elementoSelezionato.overview || 'Nessuna trama disponibile.';
        titleEl.textContent = title || 'Trama';
        textEl.textContent = text;
        metaEl.innerHTML = '';
        castEl.innerHTML = '<div class="favorites-empty">Caricamento cast...</div>';
        registrarFocoModal();
        modal.classList.add('is-open');

        try {
            const [detailsRes, creditsRes] = await Promise.all([
                tmdbFetch(`https://api.themoviedb.org/3/${currentType}/${elementoSelezionato.id}?api_key=${API_KEY}&language=${currentLanguage}`),
                tmdbFetch(`https://api.themoviedb.org/3/${currentType}/${elementoSelezionato.id}/credits?api_key=${API_KEY}&language=${currentLanguage}`)
            ]);

            if (detailsRes.ok) {
                const details = await detailsRes.json();
                const runtime = currentType === 'movie' ? formatRuntime(details.runtime) : '';
                const countries = formatCountries(details.production_countries || [], LINGUAS[currentLanguage].locale);
                const infoItems = [runtime, countries].filter(Boolean);
                metaEl.innerHTML = infoItems.length ? infoItems.map(item => `<span>${item}</span>`).join('') : '<span>Informazioni non disponibili</span>';
            } else {
                metaEl.innerHTML = '<span>Informazioni non disponibili</span>';
            }

            if (creditsRes.ok) {
                const credits = await creditsRes.json();
                const cast = (credits.cast || []).slice(0, 6);
                const director = (credits.crew || []).find(person => person.job === 'Director' || person.department === 'Directing');
                const castMarkup = cast.map(actor => {
                    const photo = actor.profile_path
                        ? `https://image.tmdb.org/t/p/w185${actor.profile_path}`
                        : "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='185' height='278'%3E%3Crect fill='%231f1f1f' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' font-family='sans-serif' font-size='12' text-anchor='middle' dominant-baseline='middle'%3ESem foto%3C/text%3E%3C/svg%3E";
                    return `
                        <div class="overview-modal-actor">
                            <img src="${photo}" alt="${actor.name || ''}" loading="lazy" decoding="async">
                            <div class="overview-modal-actor-name">${actor.name || 'Sconosciuto'}</div>
                            <div class="overview-modal-actor-role">${actor.character || 'Cast'}</div>
                        </div>`;
                }).join('');
                castEl.innerHTML = castMarkup || '<div class="favorites-empty">Nessun cast disponibile.</div>';
                if (director) {
                    const directorBlock = document.createElement('div');
                    directorBlock.className = 'overview-modal-actor';
                    directorBlock.innerHTML = `<div class="overview-modal-actor-name">Regista</div><div class="overview-modal-actor-role">${director.name || 'Sconosciuto'}</div>`;
                    castEl.appendChild(directorBlock);
                }
            } else {
                castEl.innerHTML = '<div class="favorites-empty">Nessun cast disponibile.</div>';
            }
        } catch {
            metaEl.innerHTML = '<span>Informazioni non disponibili</span>';
            castEl.innerHTML = '<div class="favorites-empty">Errore nel caricamento dei dettagli.</div>';
        }
    }

