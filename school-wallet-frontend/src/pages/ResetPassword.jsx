import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function ResetPassword() {
  const location = useLocation()
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPasswords, setShowPasswords] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const resetGrant = location.state?.resetGrant
  const passwordGuidance = newPassword.length < 12
    ? 'Use at least 12 characters.'
    : new TextEncoder().encode(newPassword).length > 72
      ? 'Use no more than 72 UTF-8 bytes.'
      : 'Password length meets the minimum requirement.'

  async function submit(event) {
    event.preventDefault()
    setError(null)
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { resetGrant, newPassword, confirmPassword })
      sessionStorage.setItem('authMessage', 'Password reset successfully. Sign in with your new password.')
      navigate('/', { replace: true })
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page"><section className="auth-panel auth-panel-narrow"><div className="auth-copy"><img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" /><p className="eyebrow">McCarthy Hill School Coupon System</p><h1>Choose a new password</h1><p>Your verified reset session is short-lived and can be used once.</p></div>{resetGrant ? <form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="newPassword">New password</label><input id="newPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength="12" maxLength="72" value={newPassword} onChange={event => setNewPassword(event.target.value)} required /><small className="password-guidance" aria-live="polite">{passwordGuidance}</small></div><div className="field"><label htmlFor="confirmPassword">Confirm new password</label><input id="confirmPassword" type={showPasswords ? 'text' : 'password'} autoComplete="new-password" minLength="12" maxLength="72" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></div><label className="password-visibility"><input type="checkbox" checked={showPasswords} onChange={event => setShowPasswords(event.target.checked)} /> Show passwords</label>{error && <p className="error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={loading}>{loading ? 'Updating...' : 'Set new password'}</button></form> : <div className="auth-form"><p className="error">Verify your reset code to continue.</p><Link className="primary-button button-link" to="/verify-reset-code">Verify reset code</Link><p className="auth-switch"><Link to="/">Return to sign in</Link></p></div>}</section></main>
}
