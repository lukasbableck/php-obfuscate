import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';

export default defineConfig([
    eslint.configs.recommended,
    tseslint.configs.recommendedTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
        ignores: ['dist/**', 'node_modules/**', '.bun/'],
    },
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/unbound-method': ['error', { ignoreStatic: true }],
        },
    },
    eslintConfigPrettier,
]);
