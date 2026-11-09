import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function Login() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(false)
  const { login } = useContext(AuthContext)

  useEffect(() => {
    const authMessage = sessionStorage.getItem('authMessage')
    if (authMessage) {
      setNotice(authMessage)
      sessionStorage.removeItem('authMessage')
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
      setError(null)
      setNotice(null)
      setLoading(true)
    try {
      await login({ identifier, password })
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel-narrow">
        <div className="auth-copy">
          <img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" />
          <p className="eyebrow">McCarthy Hill School Coupon System</p>
          <h1>Welcome back</h1>
          <p>Sign in to manage McCarthy Hill student coupons, wallets, top-ups, and vendor sales.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="identifier">Email, full name, username, phone, or vendor ID</label>
            <input id="identifier" required value={identifier} onChange={e => setIdentifier(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {notice && <p className="success">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
          <p className="auth-switch">Need an account? <Link to="/register">Create one</Link></p>
          <p className="auth-switch"><Link to="/forgot-password">Forgot your password?</Link></p>
        </form>
      </section>
    </main>
  )
}
