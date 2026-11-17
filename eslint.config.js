import antfu from '@antfu/eslint-config'

export default antfu({
  rules: {
    // Keep the existing compact style after the config v10 update.
    'antfu/reasonable-newline': 'off',
    'no-console': 'off',
    'node/prefer-global/process': 'off',
    'ts/no-use-before-define': 'off',
  },
  ignores: ['dist', 'node_modules', 'test/**/fixtures/**'],
})
