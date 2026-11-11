import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function submit(event) {
    event.preventDefault()
    setMessage(null)
    setError(null)
    setLoading(true)
    try {
      const response = await api.post('/auth/forgot-password', { email })
      setMessage(response.data?.message || 'If an eligible account exists, a password reset request has been submitted.')
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page"><section className="auth-panel auth-panel-narrow"><div className="auth-copy"><img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" /><p className="eyebrow">McCarthy Hill School Coupon System</p><h1>Request a password reset</h1><p>A Superadmin will review the request. If approved, they will provide a short-lived reset code.</p></div><form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="resetEmail">Registered email</label><input id="resetEmail" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div>{error && <p className="error">{error}</p>}{message && <p className="success reset-message" role="status">{message}</p>}{message && <button className="secondary-button" type="button" onClick={() => navigate('/verify-reset-code', { state: { email } })}>I have a reset code</button>}<button className="primary-button" type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit request'}</button><p className="auth-switch"><Link to="/">Return to sign in</Link></p></form></section></main>
}
