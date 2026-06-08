import { defineConfig } from 'vite-plus';

export default defineConfig({
  pack: {
    entry: 'src/index.js',
    outDir: 'dist',
    format: ['esm', 'umd'],
    globalName: 'storage',
    target: 'es2020',
    platform: 'browser',
    minify: true,
    clean: true,
    outExtensions({ format }) {
      return {
        js: format === 'es' ? '.mjs' : '.js',
      };
    },
    // sourcemap: true,
    exports: false,
  },

  lint: {
    ignorePatterns: ['dist/**', 'node_modules/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },

  fmt: {
    ignorePatterns: ['dist/**'],
    sortPackageJson: true,
    sortImports: true,
    sortTailwindcss: true,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    useTabs: false,
    printWidth: 80,
    trailingComma: 'es5',
    arrowParens: 'always',
    bracketSameLine: false,
    bracketSpacing: true,
    embeddedLanguageFormatting: 'auto',
    endOfLine: 'lf',
    htmlWhitespaceSensitivity: 'css',
    insertFinalNewline: true,
  },
});
