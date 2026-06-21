import { render, screen } from '@testing-library/react'
import { Tag } from './Tag'

describe('Tag', () => {
  it('renders children', () => {
    render(<Tag variant="rtu">3 RTUs</Tag>)
    expect(screen.getByText('3 RTUs')).toBeInTheDocument()
  })
})
