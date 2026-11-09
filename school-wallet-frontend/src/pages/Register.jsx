import React, { useState, useContext } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import schoolLogo from '../public/cropped-transparent-logo-1.png'

export default function Register() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const { register } = useContext(AuthContext)

  function updateField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await register(form)
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err.response?.data?.message || err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-copy">
          <img className="auth-logo" src={schoolLogo} alt="McCarthy Hill School logo" />
          <p className="eyebrow">McCarthy Hill School Coupon System</p>
          <h1>Create your account</h1>
          <p>Create a parent account to link McCarthy Hill students and manage coupon wallet activity securely.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="firstName">First name</label>
              <input id="firstName" required value={form.firstName} onChange={e => updateField('firstName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="lastName">Last name</label>
              <input id="lastName" required value={form.lastName} onChange={e => updateField('lastName', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" required minLength="3" maxLength="32" pattern="[A-Za-z0-9._-]+" title="Use 3-32 letters, numbers, dots, underscores, or hyphens" value={form.username} onChange={e => updateField('username', e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" maxLength="255" required value={form.email} onChange={e => updateField('email', e.target.value)} />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="phone">Phone</label>
              <input id="phone" type="tel" maxLength="20" pattern="\+?[0-9][0-9\s().-]{4,19}" title="Enter a valid phone number" value={form.phone} onChange={e => updateField('phone', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="accountType">Account type</label>
              <input id="accountType" value="Parent" readOnly />
            </div>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" type="password" required minLength="12" value={form.password} onChange={e => updateField('password', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input id="confirmPassword" type="password" required minLength="12" value={form.confirmPassword} onChange={e => updateField('confirmPassword', e.target.value)} />
            </div>
          </div>
          <p className="auth-switch">Use at least 12 characters for your password.</p>

          {error && <p className="error">{error}</p>}
          <button className="primary-button" type="submit" disabled={loading}>{loading ? 'Creating account...' : 'Create account'}</button>
          <p className="auth-switch">Already have an account? <Link to="/">Sign in</Link></p>
      </form>
      </section>
    </main>
  )
}
