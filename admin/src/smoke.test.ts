import { render, screen } from '@testing-library/svelte'
import { expect, test } from 'vitest'
import App from './App.svelte'

test('renders the admin console heading', () => {
  render(App)
  expect(screen.getByText('Admin console')).toBeInTheDocument()
})
