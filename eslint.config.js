import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Code-split boundary (redesign Phase 0): the public surface must never
    // pull director UI into the parent-facing bundle. DirectorApp is the one
    // lazy import; these are the only director modules public code may share.
    // New shared primitives belong in src/shared/, not src/director/.
    files: ['src/public/**/*.{ts,tsx}', 'src/shared/**/*.{ts,tsx}', 'src/main.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          regex: 'director/(?!(hooks/|utils$|types$|firebase$|rosterResolver$|scoreOrder$|components/Linkify$|DirectorApp$))',
          message: 'Public/shared code may only import director hooks, utils, types, firebase, rosterResolver, scoreOrder, or Linkify — anything else drags director UI into the public bundle. Put shared primitives in src/shared/.',
        }],
      }],
    },
  },
])
