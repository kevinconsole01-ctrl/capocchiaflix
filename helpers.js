// Funções puras e tabelas de dados compartilhadas.
// Funciona como script clássico no navegador (window.CapoHelpers)
// e como módulo nos testes (module.exports).
(function (global) {
    'use strict';

    const POSTER_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='185' height='278'%3E%3Crect fill='%231f1f1f' width='100%25' height='100%25'/%3E%3Ctext x='50%25' y='50%25' fill='%23666' font-family='sans-serif' font-size='13' text-anchor='middle' dominant-baseline='middle'%3ESem capa%3C/text%3E%3C/svg%3E";

    function posterUrl(item, size) {
        size = size || 'w342';
        if (item && item.poster_path) {
            return 'https://image.tmdb.org/t/p/' + size + item.poster_path;
        }
        return POSTER_PLACEHOLDER;
    }

    function formatRuntime(minutes) {
        if (!minutes) return '';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours ? hours + 'h ' + mins + 'm' : mins + 'm';
    }

    function formatCountries(countries, locale) {
        if (!Array.isArray(countries) || !countries.length) return '';
        locale = locale || 'it';
        let regionNames = null;
        try {
            regionNames = new Intl.DisplayNames([locale], { type: 'region' });
        } catch (e) {
            regionNames = null;
        }
        return countries.map(function (country) {
            if (regionNames && country.iso_3166_1) {
                try {
                    const localized = regionNames.of(country.iso_3166_1);
                    if (localized) return localized;
                } catch (e) { /* iso inválido: usa o nome original */ }
            }
            return country.name || country.iso_3166_1;
        }).filter(Boolean).join(', ');
    }

    function getFavoriteKey(item, fallbackType) {
        return (item && item.type || fallbackType || 'movie') + ':' + (item && item.id);
    }

    function getContinueKey(item) {
        return (item && item.type || 'movie') + ':' + (item && item.id);
    }

    const STREAMING_PROVIDERS = [
        { id: null, label: 'Tutti', color: 'transparent' },
        { id: 8, label: 'Netflix', color: '#E50914' },
        { id: 337, label: 'Disney+', color: '#113CCF' },
        { id: 531, label: 'Paramount+', color: '#0064FF' },
        { id: 1899, label: 'HBO Max', color: '#5822b4' },
        { id: 119, label: 'Prime Video', color: '#00A8E1' },
        { id: 2, label: 'Apple TV+', color: '#555555' }
    ];

    const GENRES_BY_TYPE = {
        movie: [
            { id: null, label: 'Tutti' },
            { id: 28, label: 'Azione' },
            { id: 12, label: 'Avventura' },
            { id: 16, label: 'Animazione' },
            { id: 35, label: 'Commedia' },
            { id: 80, label: 'Crime' },
            { id: 99, label: 'Documentario' },
            { id: 18, label: 'Dramma' },
            { id: 10751, label: 'Famiglia' },
            { id: 14, label: 'Fantasy' },
            { id: 27, label: 'Horror' },
            { id: 10402, label: 'Musica' },
            { id: 10749, label: 'Romantico' },
            { id: 878, label: 'Fantascienza' },
            { id: 53, label: 'Thriller' },
            { id: 10752, label: 'Guerra' },
            { id: 37, label: 'Western' }
        ],
        tv: [
            { id: null, label: 'Tutti' },
            { id: 10759, label: 'Azione' },
            { id: 16, label: 'Animazione' },
            { id: 35, label: 'Commedia' },
            { id: 80, label: 'Crime' },
            { id: 99, label: 'Documentario' },
            { id: 18, label: 'Dramma' },
            { id: 10751, label: 'Famiglia' },
            { id: 10765, label: 'Fantascienza' },
            { id: 10762, label: 'Kids' },
            { id: 9648, label: 'Mystery' },
            { id: 10763, label: 'News' },
            { id: 10764, label: 'Reality' },
            { id: 10766, label: 'Talk' },
            { id: 10767, label: 'War & Politics' },
            { id: 10768, label: 'Guerra' },
            { id: 37, label: 'Western' }
        ]
    };

    function getGenreLabel(id, type) {
        if (id == null) return '';
        const list = GENRES_BY_TYPE[type] || [];
        const found = list.find(function (g) { return g.id === id; });
        return found ? found.label : 'Genere';
    }

    function getProviderLabel(id) {
        const provider = STREAMING_PROVIDERS.find(function (p) { return p.id === id; });
        return provider ? provider.label : '';
    }

    const api = {
        POSTER_PLACEHOLDER: POSTER_PLACEHOLDER,
        posterUrl: posterUrl,
        formatRuntime: formatRuntime,
        formatCountries: formatCountries,
        getFavoriteKey: getFavoriteKey,
        getContinueKey: getContinueKey,
        STREAMING_PROVIDERS: STREAMING_PROVIDERS,
        GENRES_BY_TYPE: GENRES_BY_TYPE,
        getGenreLabel: getGenreLabel,
        getProviderLabel: getProviderLabel
    };

    global.CapoHelpers = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
