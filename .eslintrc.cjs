module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    'node_modules',
    'build',
    'frontend/tests',
    'backend/test',
    'scripts',
    'docs',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    'no-unused-vars': 'warn',
  },
  overrides: [
    {
      // tools/cli 是纯 Node 的 CLI，跟 React 无关。
      // 不关掉 react-hooks 规则的话，任何叫 useXxx 的普通函数都会被误判成 Hook。
      files: ['tools/cli/**/*.mjs'],
      env: { browser: false, node: true, es2023: true },
      rules: {
        'react-hooks/rules-of-hooks': 'off',
        'react-hooks/exhaustive-deps': 'off',
        'react-refresh/only-export-components': 'off',
      },
    },
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
    },
  ],
};
