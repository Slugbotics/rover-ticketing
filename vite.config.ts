import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/rover-ticketing/' : '/',
  plugins: [react()],
}))
