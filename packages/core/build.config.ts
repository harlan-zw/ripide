import { defineBuildConfig } from 'obuild/config'

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts', './src/adapter.ts'],
      rolldown: { transform: { target: 'node22.13' } },
    },
  ],
})
