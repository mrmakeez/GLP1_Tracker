import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: false,
    needRefresh: false,
    updateServiceWorker: () => {},
  }),
}))

describe('App', () => {
  it('renders the Doses page by default', () => {
    render(
      <MemoryRouter initialEntries={['/doses']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'Doses' }),
    ).toBeInTheDocument()
  })
})
