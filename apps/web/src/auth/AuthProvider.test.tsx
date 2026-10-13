import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffSignInForm } from './AuthProvider'

const mocks = vi.hoisted(() => ({ signInWithPassword: vi.fn() }))
vi.mock('./useStaffSession', () => ({
  useStaffSession: () => ({ signInWithPassword: mocks.signInWithPassword }),
}))

describe('StaffSignInForm', () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset()
    mocks.signInWithPassword.mockResolvedValue({ ok: true })
  })

  it('accepts an email or username and forwards the identifier unchanged', async () => {
    render(<StaffSignInForm />)

    const identifier = screen.getByLabelText('Email or username')
    expect(identifier).toHaveAttribute('type', 'text')

    fireEvent.change(identifier, { target: { value: 'Teacher.One' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'safe-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(mocks.signInWithPassword).toHaveBeenCalledWith('Teacher.One', 'safe-password')
    expect(await screen.findByText('Signed in successfully!')).toBeInTheDocument()
  })
})
