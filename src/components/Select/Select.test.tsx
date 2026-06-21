import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from './Select'

describe('Select', () => {
  it('renders options', () => {
    render(
      <Select
        label="Park"
        options={[
          { value: 'park-a', label: 'Park A' },
          { value: 'park-b', label: 'Park B' },
        ]}
      />,
    )
    expect(screen.getByLabelText('Park')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Park A' })).toBeInTheDocument()
  })

  it('changes value', async () => {
    const user = userEvent.setup()
    render(
      <Select
        label="Park"
        options={[{ value: 'park-a', label: 'Park A' }]}
        onChange={() => undefined}
      />,
    )
    await user.selectOptions(screen.getByLabelText('Park'), 'park-a')
    expect(screen.getByLabelText('Park')).toHaveValue('park-a')
  })
})
