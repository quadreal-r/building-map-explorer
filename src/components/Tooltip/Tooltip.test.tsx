import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('renders children', () => {
    render(
      <Tooltip content="Help text">
        <button type="button">Hover me</button>
      </Tooltip>,
    )
    expect(screen.getByRole('button', { name: 'Hover me' })).toBeInTheDocument()
  })

  it('shows tooltip on hover', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip content="Help text">
        <button type="button">Hover me</button>
      </Tooltip>,
    )
    await user.hover(screen.getByRole('button', { name: 'Hover me' }))
    expect(screen.getByRole('tooltip')).toHaveTextContent('Help text')
  })
})
