import { liangmi } from '@liangmi/vp-config'

export default liangmi({
  // Formatting is enabled in a follow-up. Until then, `vp check` skips it.
  check: { fmt: false },
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
        'react-perf/jsx-no-jsx-as-prop': 'off',
        'react-perf/jsx-no-new-object-as-prop': 'off',
        'react-perf/jsx-no-new-array-as-prop': 'off',
        'react-perf/jsx-no-new-function-as-prop': 'off',
        // IPC and JSON payloads are validated defensively, even where their types say a value is always set.
        'typescript/no-unnecessary-condition': 'off',
        'typescript/no-unnecessary-boolean-literal-compare': 'off',
        'typescript/no-unnecessary-type-conversion': 'off',
        // `||` treats empty strings as missing on purpose, such as for env variables.
        'typescript/prefer-nullish-coalescing': 'off',
        // Tool `execute`, imagery providers and retry handlers must return promises, and `async` turns throws into rejections.
        'typescript/require-await': 'off',
        // `toSorted` and `toReversed` need the ES2023 lib, and tsconfig targets ES2022.
        'unicorn/no-array-sort': 'off',
        'unicorn/no-array-reverse': 'off',
        // Style-only rules that would move most helpers or rewrite callback-based Electron and Cesium APIs.
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/max-nested-calls': 'off',
        'promise/prefer-await-to-callbacks': 'off',
        'typescript/method-signature-style': 'off'
      }
    }
  ],
  test: {
    environment: 'node',
    include: ['tests/*.test.mjs'],
    experimental: { viteModuleRunner: false }
  }
})
