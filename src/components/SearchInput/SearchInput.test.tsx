import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchInput } from './SearchInput'

describe('SearchInput', () => {
  it('renders with placeholder', () => {
    render(<SearchInput placeholder="Find building" />)
    expect(screen.getByPlaceholderText('Find building')).toBeInTheDocument()
  })

  it('calls onValueChange', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<SearchInput onValueChange={onValueChange} />)
    await user.type(screen.getByRole('textbox'), 'derry')
    expect(onValueChange).toHaveBeenCalled()
    expect(onValueChange).toHaveBeenLastCalledWith('derry')
  })
})
