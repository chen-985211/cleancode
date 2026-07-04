import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'out/**',
      'dist/**',
      'dist-electron/**',
      'build/**',
      'release/**',
      'coverage/**',
      '.vite/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-import-type-side-effects': 'error'
    }
  },
  {
    files: [
      '*.config.ts',
      'src/platform/electron-main/**/*.ts',
      'src/platform/electron-preload/**/*.ts'
    ],
    languageOptions: {
      globals: globals.node
    }
  },
  {
    files: ['*.js', '*.mjs', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'module'
    }
  },
  {
    files: ['*.cjs', '.dependency-cruiser.cjs'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs'
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  },
  {
    files: [
      'src/platform/renderer-bootstrap/**/*.{ts,tsx}',
      'src/presentation/**/*.{ts,tsx}',
      'tests/**/*.{ts,tsx}'
    ],
    languageOptions: {
      globals: globals.browser
    }
  },
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.vitest
    }
  },
  {
    files: ['src/**/*.tsx', 'tests/**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  }
)
