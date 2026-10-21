import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyScheme = () =>
  document.documentElement.classList.toggle('dark', media.matches)
applyScheme()
media.addEventListener('change', applyScheme)

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
