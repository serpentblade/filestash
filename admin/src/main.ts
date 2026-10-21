import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { loadLanguage } from '$lib/i18n'

const media = window.matchMedia('(prefers-color-scheme: dark)')
const applyScheme = () =>
  document.documentElement.classList.toggle('dark', media.matches)
applyScheme()
media.addEventListener('change', applyScheme)

// a missing translation file leaves the console in English, so this never blocks mounting
await loadLanguage()

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
