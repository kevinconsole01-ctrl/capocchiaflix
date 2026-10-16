import globals from 'globals';

export default [
    {
        ignores: ['node_modules/**']
    },
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.node,
                CapoHelpers: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-undef': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error'
        }
    },
    {
        files: ['app.js', 'helpers.js'],
        languageOptions: {
            globals: {
                firebase: 'readonly'
            }
        },
        rules: {
            // Funções são chamadas pelos onclick no HTML, então o ESLint
            // não enxerga os usos.
            'no-unused-vars': 'off'
        }
    },
    {
        files: ['tests/**/*.js', 'vitest.config.mjs', 'eslint.config.js'],
        languageOptions: {
            sourceType: 'module',
            globals: {
                ...globals.node
            }
        }
    }
];
