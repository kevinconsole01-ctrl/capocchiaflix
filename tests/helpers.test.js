import { describe, it, expect } from 'vitest';
import capo from '../helpers.js';

const {
    posterUrl,
    formatRuntime,
    formatCountries,
    getFavoriteKey,
    getContinueKey,
    getGenreLabel,
    getProviderLabel,
    POSTER_PLACEHOLDER,
    GENRES_BY_TYPE,
    STREAMING_PROVIDERS
} = capo;

describe('posterUrl', () => {
    it('monta a URL do TMDB quando há poster_path', () => {
        expect(posterUrl({ poster_path: '/abc.jpg' })).toBe('https://image.tmdb.org/t/p/w342/abc.jpg');
    });

    it('aceita tamanho customizado', () => {
        expect(posterUrl({ poster_path: '/abc.jpg' }, 'w200')).toBe('https://image.tmdb.org/t/p/w200/abc.jpg');
    });

    it('usa o placeholder local sem poster', () => {
        expect(posterUrl({})).toBe(POSTER_PLACEHOLDER);
        expect(posterUrl(null)).toBe(POSTER_PLACEHOLDER);
    });
});

describe('formatRuntime', () => {
    it('formata horas e minutos', () => {
        expect(formatRuntime(126)).toBe('2h 6m');
        expect(formatRuntime(60)).toBe('1h 0m');
    });

    it('formata só minutos quando < 60', () => {
        expect(formatRuntime(45)).toBe('45m');
    });

    it('retorna vazio para valores nulos', () => {
        expect(formatRuntime(null)).toBe('');
        expect(formatRuntime(0)).toBe('');
        expect(formatRuntime(undefined)).toBe('');
    });
});

describe('formatCountries', () => {
    it('retorna vazio para lista vazia', () => {
        expect(formatCountries([])).toBe('');
        expect(formatCountries(null)).toBe('');
    });

    it('usa o nome original quando não há Intl', () => {
        const result = formatCountries([{ iso_3166_1: 'IT', name: 'Italy' }]);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    it('aceita locale customizado', () => {
        const emIngles = formatCountries([{ iso_3166_1: 'US', name: 'United States' }], 'en');
        expect(typeof emIngles).toBe('string');
        expect(emIngles.length).toBeGreaterThan(0);
    });
});

describe('chaves de identificação', () => {
    it('getFavoriteKey usa o tipo do item ou o fallback', () => {
        expect(getFavoriteKey({ id: 1, type: 'tv' })).toBe('tv:1');
        expect(getFavoriteKey({ id: 1 }, 'movie')).toBe('movie:1');
        expect(getFavoriteKey({ id: 1 })).toBe('movie:1');
    });

    it('getContinueKey usa movie como padrão', () => {
        expect(getContinueKey({ id: 5 })).toBe('movie:5');
        expect(getContinueKey({ id: 5, type: 'tv' })).toBe('tv:5');
    });
});

describe('tabelas e labels', () => {
    it('getGenreLabel resolve o gênero por tipo', () => {
        expect(getGenreLabel(28, 'movie')).toBe('Azione');
        expect(getGenreLabel(10759, 'tv')).toBe('Azione');
        expect(getGenreLabel(null, 'movie')).toBe('');
        expect(getGenreLabel(999999, 'movie')).toBe('Genere');
    });

    it('getProviderLabel resolve provedores', () => {
        expect(getProviderLabel(8)).toBe('Netflix');
        expect(getProviderLabel(null)).toBe('Tutti');
        expect(getProviderLabel(999999)).toBe('');
    });

    it('GENRES_BY_TYPE tem movie e tv com opção Tutti', () => {
        expect(GENRES_BY_TYPE.movie[0]).toEqual({ id: null, label: 'Tutti' });
        expect(GENRES_BY_TYPE.tv[0]).toEqual({ id: null, label: 'Tutti' });
    });

    it('STREAMING_PROVIDERS lista os serviços principais', () => {
        const labels = STREAMING_PROVIDERS.map(p => p.label);
        expect(labels).toContain('Netflix');
        expect(labels).toContain('Disney+');
    });
});
