module.exports = {
  root: true,
  // 纯 Node 项目：后端 Express 服务 + tools/cli。没有浏览器代码。
  env: { es2023: true, node: true },
  extends: ['eslint:recommended'],
  ignorePatterns: [
    'dist',
    '.eslintrc.cjs',
    'node_modules',
    'build',
    'backend/test',
    // 只忽略仓库根的 scripts/（全是 shell）；backend/scripts/ 下是实打实的 JS，要检。
    '/scripts',
    '/docs',
  ],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: {
    'no-unused-vars': 'warn',
  },
};
