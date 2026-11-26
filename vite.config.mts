import { liangmi } from '@liangmi/vp-config'

export default liangmi({
  // GeoJSON data and third-party license texts keep their upstream layout.
  fmt: { ignorePatterns: ['resources/**'] },
  lint: [
    {
      name: 'guearth/conventions',
      rules: {
        // React components and their files use PascalCase names and default exports.
        'unicorn/filename-case': 'off',
        'import/no-default-export': 'off',
        'import/no-named-as-default': 'off',
        // The renderer talks to `window` and Cesium on purpose, including Cesium's private `_` fields.
        'unicorn/prefer-global-this': 'off',
        'eslint/no-underscore-dangle': 'off',
        // The main process is bundled as CommonJS, so `__dirname` is valid there.
        'unicorn/prefer-module': 'off',
        // Stores, errors and protocol readers are written as classes.
        'eslint/max-classes-per-file': 'off',
        // JSX props are not memoized across the app, and there is no React Compiler to rely on.
        'react-perf/jsx-no-new-object-as-prop': 'off',
        'react-perf/jsx-no-new-array-as-prop': 'off',
        'react/jsx-no-constructed-context-values': 'off',
        // React Compiler checks. Fixing them changes render and effect timing, so they need testing in the running app first.
        'react/refs': 'off',
        'react/set-state-in-effect': 'off',
        'react/exhaustive-effect-dependencies': 'off',
        'react/preserve-manual-memoization': 'off',
        'react/memo-dependencies': 'off',
        'react/immutability': 'off',
        'react/purity': 'off',
        // IPC and JSON payloads are validated defensively, even where their types say a value is always set.
        'typescript/no-unnecessary-condition': 'off',
        'typescript/no-unnecessary-boolean-literal-compare': 'off',
        'typescript/no-unnecessary-type-conversion': 'off',
        // `||` treats empty strings as missing on purpose, such as for env variables.
        'typescript/prefer-nullish-coalescing': 'off',
        // Tool `execute`, imagery providers and retry handlers must return promises, and `async` turns throws into rejections.
        'typescript/require-await': 'off',
        // Promise executors use descriptive names, such as `resolveReady`, so they don't shadow an outer `resolve`.
        'promise/param-names': 'off',
        // `.then` callbacks run side effects in fire-and-forget chains, and `String(x)` stringifies untyped JSON on purpose.
        'promise/always-return': 'off',
        'typescript/no-base-to-string': 'off',
        // `attachConsoleLogTee` routes console warnings and errors into the log files.
        'eslint/no-console': 'off',
        // Effects return a cleanup on some paths and nothing on early exits, and tests `return t.skip()`.
        'typescript/consistent-return': 'off',
        // `toSorted` and `toReversed` need the ES2023 lib, and tsconfig targets ES2022.
        'unicorn/no-array-sort': 'off',
        'unicorn/no-array-reverse': 'off',
        // Style-only rules that would move most helpers or rewrite callback-based Electron and Cesium APIs.
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/max-nested-calls': 'off',
        'promise/prefer-await-to-callbacks': 'off',
        'typescript/method-signature-style': 'off',
        'unicorn/prefer-ternary': 'off',
        // The formatter writes hexadecimal digits in lowercase.
        'unicorn/number-literal-case': 'off',
        'unicorn/prefer-export-from': 'off',
        'oxc/no-map-spread': 'off',
        // CSS, locale and Sentry preload modules are imported for their side effects.
        'import/no-unassigned-import': 'off',
        // `== null` checks for both `null` and `undefined`.
        'eslint/eqeqeq': ['error', 'always', { null: 'ignore' }],
        // Copies such as `[...map.keys()]` protect loops that change the collection.
        'unicorn/no-useless-spread': 'off',
        // `structuredClone` throws where the JSON round trip drops functions, and `codePointAt` reads surrogate pairs.
        'unicorn/prefer-structured-clone': 'off',
        'unicorn/prefer-code-point': 'off',
        // `worker_threads` ports have no target origin.
        'unicorn/require-post-message-target-origin': 'off',
        // Static diagram lists, which never reorder, are keyed by index.
        'react/no-array-index-key': 'off',
        // Empty props interfaces are kept as placeholders next to each component.
        'typescript/no-empty-interface': 'off',
        // Moving off deprecated assistant-ui APIs and `keyCode` (IME composition) needs testing in the running app first.
        'typescript/no-deprecated': 'off'
      }
    },
    {
      name: 'guearth/tests',
      files: ['tests/**'],
      rules: {
        // Tests pass `undefined` explicitly to name the input under test.
        'unicorn/no-useless-undefined': 'off',
        // Fixtures build unusual inputs on purpose: extracted source run with `new Function`,
        // Unsafe URLs, non-Error throws and rejections, and optional arguments before required ones.
        'eslint/no-new-func': 'off',
        'typescript/no-implied-eval': 'off',
        'eslint/no-script-url': 'off',
        'eslint/no-throw-literal': 'off',
        'typescript/only-throw-error': 'off',
        'typescript/prefer-promise-reject-errors': 'off',
        'eslint/default-param-last': 'off',
        // Untyped `.mjs` tests make type-aware void checks guess wrong.
        'typescript/no-confusing-void-expression': 'off'
      }
    }
  ],
  test: {
    environment: 'node',
    include: ['tests/*.test.mjs'],
    experimental: { viteModuleRunner: false }
  }
})
