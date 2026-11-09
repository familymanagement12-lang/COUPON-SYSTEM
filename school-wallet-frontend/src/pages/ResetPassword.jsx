import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    try {
      const response = await api.post('/auth/reset-password', { token: params.get('token'), newPassword, confirmPassword })
      setMessage(response.data.message)
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    }
  }

  return <main className="auth-page"><section className="auth-panel auth-panel-narrow"><div className="auth-copy"><img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" /><p className="eyebrow">McCarthy Hill School Coupon System</p><h1>Choose a new password</h1><p>Use at least eight characters. This reset link can only be used once.</p></div><form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="newPassword">New password</label><input id="newPassword" type="password" minLength="8" value={newPassword} onChange={event => setNewPassword(event.target.value)} required /></div><div className="field"><label htmlFor="confirmPassword">Confirm password</label><input id="confirmPassword" type="password" minLength="8" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div>{error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}<button className="primary-button" type="submit">Reset password</button>{message && <p className="auth-switch"><Link to="/">Return to sign in</Link></p>}</form></section></main>
}
