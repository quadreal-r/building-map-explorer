import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from './Chip'

describe('Chip', () => {
  it('renders label', () => {
    render(<Chip>GPS?</Chip>)
    expect(screen.getByRole('button', { name: 'GPS?' })).toBeInTheDocument()
  })

  it('toggles via click', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Chip onClick={onClick}>Filter</Chip>)
    await user.click(screen.getByRole('button', { name: 'Filter' }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
