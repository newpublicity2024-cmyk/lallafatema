import next from 'eslint-config-next'

const eslintConfig = [
  ...next,
  {
    ignores: ['.next/', 'src/payload-types.ts', 'src/payload-generated-schema.ts'],
  },
]

export default eslintConfig
