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
    // 只忽略仓库根的 scripts/（全是 shell）。原来写 'scripts' 会匹配任意层级，
    // 把 frontend/scripts/ 下 19 个巡检脚本一起排除掉了，那些是实打实的 JS。
    '/scripts',
    '/docs',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    'no-unused-vars': 'warn',
    // Downgraded from error. Syncing state to a route change (closing the mobile menu
    // on navigation) and kicking off a fetch on mount are exactly what an effect is
    // for, and the rule flags both. Kept as a warning so genuinely cascading renders
    // still get surfaced without failing the build on correct code.
    'react-hooks/set-state-in-effect': 'warn',
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
