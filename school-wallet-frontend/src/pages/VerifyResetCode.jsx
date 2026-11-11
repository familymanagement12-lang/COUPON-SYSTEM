import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function VerifyResetCode() {
  const location = useLocation()
  const navigate = useNavigate()
  const [email, setEmail] = useState(location.state?.email || '')
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const response = await api.post('/auth/verify-reset-code', { email, code })
      navigate('/reset-password', { replace: true, state: { resetGrant: response.data.data.resetGrant } })
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return <main className="auth-page"><section className="auth-panel auth-panel-narrow"><div className="auth-copy"><img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" /><p className="eyebrow">McCarthy Hill School Coupon System</p><h1>Enter your reset code</h1><p>The code expires 15 minutes after it is issued and can be used once.</p></div><form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="resetCodeEmail">Registered email</label><input id="resetCodeEmail" type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required /></div><div className="field"><label htmlFor="resetCode">Reset code</label><input id="resetCode" inputMode="text" autoComplete="one-time-code" maxLength="32" value={code} onChange={event => setCode(event.target.value.trim())} required /></div>{error && <p className="error" role="alert">{error}</p>}<button className="primary-button" type="submit" disabled={loading}>{loading ? 'Verifying...' : 'Verify code'}</button><p className="auth-switch"><Link to="/forgot-password">Submit another request</Link></p></form></section></main>
}