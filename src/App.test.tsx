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

  it('renders routes correctly when mounted under the GitHub Pages base path', () => {
    render(
      <MemoryRouter
        basename="/GLP1_Tracker/"
        initialEntries={['/GLP1_Tracker/chart']}
      >
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'Chart' }),
    ).toBeInTheDocument()
  })

  it('fails to resolve GitHub Pages routes without a basename', () => {
    render(
      <MemoryRouter initialEntries={['/GLP1_Tracker/chart']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })
})
