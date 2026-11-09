import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function ForgotPassword() {
  const [identifier, setIdentifier] = useState('')
  const [message, setMessage] = useState(null)
  const [resetUrl, setResetUrl] = useState(null)
  const [error, setError] = useState(null)

  async function submit(event) {
    event.preventDefault()
    setMessage(null)
    setResetUrl(null)
    setError(null)
    try {
      const response = await api.post('/auth/forgot-password', { identifier })
      const responseData = response.data?.data || response.data || {}
      setResetUrl(responseData.resetUrl || null)
      setMessage(response.data?.message || responseData.message || 'Reset instructions created.')
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    }
  }

  return <main className="auth-page"><section className="auth-panel auth-panel-narrow"><div className="auth-copy"><img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" /><p className="eyebrow">McCarthy Hill School Coupon System</p><h1>Reset your password</h1><p>Enter your email or username and we will create a secure reset link.</p></div><form className="auth-form" onSubmit={submit}><div className="field"><label htmlFor="resetIdentifier">Email or username</label><input id="resetIdentifier" value={identifier} onChange={e => setIdentifier(e.target.value)} required /></div>{error && <p className="error">{error}</p>}{message && <p className="success reset-message">{message}</p>}{resetUrl && <a className="primary-button button-link" href={resetUrl}>Open reset page</a>}<button className="primary-button" type="submit">Create reset link</button><p className="auth-switch"><Link to="/">Return to sign in</Link></p></form></section></main>
}
