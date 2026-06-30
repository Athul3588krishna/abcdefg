import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const repoName = env.GITHUB_REPOSITORY?.split('/')[1] || 'census-field-system'

  return {
    plugins: [react()],
    base: mode === 'production' && env.GITHUB_REPOSITORY ? `/${repoName}/` : '/',
  }
})
