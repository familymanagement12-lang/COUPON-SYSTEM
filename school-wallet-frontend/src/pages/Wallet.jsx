import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function Wallet(){
  const { user } = useContext(AuthContext)
  const [wallet, setWallet] = useState(null)
  const [limits, setLimits] = useState({})
  const [error, setError] = useState(null)
  const [savingLimitId, setSavingLimitId] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(()=>{
    async function load(){
      try{
        const walletMessage = sessionStorage.getItem('walletMessage')
        if (walletMessage) {
          setSuccess(walletMessage)
          sessionStorage.removeItem('walletMessage')
        }

        const res = await api.get('/wallets/me')
        const walletData = res.data.data
        const walletList = Array.isArray(walletData) ? walletData : walletData ? [walletData] : []
        setWallet(walletData)

        if (user?.role === 'parent' || user?.role === 'admin') {
          const limitEntries = await Promise.all(walletList.map(async item => {
            const studentInternalId = item.student_internal_id || item.student_id
            try {
              const limitResponse = await api.get(`/spending/${studentInternalId}`)
              return [studentInternalId, limitResponse.data.data.limits]
            } catch {
              return [studentInternalId, { daily_limit: '', weekly_limit: '' }]
            }
          }))
          setLimits(Object.fromEntries(limitEntries))
        }
      }catch(e){
        setError(e.response?.data?.message || e.message)
      }
    }
    load()
  },[user?.role])

  function updateLimit(studentId, field, value) {
    setLimits(current => ({
      ...current,
      [studentId]: {
        ...(current[studentId] || {}),
        [field]: value
      }
    }))
  }

  async function saveLimit(studentId) {
    setError(null)
    setSuccess(null)
    setSavingLimitId(studentId)

    try {
      const currentLimit = limits[studentId] || {}
      const response = await api.post(`/spending/${studentId}`, {
        daily_limit: currentLimit.daily_limit === '' ? null : currentLimit.daily_limit,
        weekly_limit: currentLimit.weekly_limit === '' ? null : currentLimit.weekly_limit
      })
      setLimits(current => ({ ...current, [studentId]: response.data.data.limits }))
      setSuccess('Spending limit saved.')
    } catch (e) {
      setError(e.response?.data?.message || e.message)
    } finally {
      setSavingLimitId(null)
    }
  }

  const wallets = Array.isArray(wallet) ? wallet : wallet ? [wallet] : []
  const totalBalance = wallets.reduce((sum, item) => sum + Number(item.balance || 0), 0)
  const activeWallets = wallets.filter(item => item.status === 'active').length
  const primaryWallet = wallets[0]

  return (
    <div className="container">
      <div className="page-heading wallet-page-heading">
        <div>
          <p className="eyebrow">McCarthy Hill coupons</p>
          <h1>My Wallet</h1>
          <p className="lede">View balances, wallet status, and coupon funds available for school purchases.</p>
        </div>
        <div className="wallet-actions">
          <Link className="primary-button button-link" to="/topup">Top Up</Link>
          <Link className="secondary-button button-link" to="/transactions">Transactions</Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {wallet ? (
        <section className="wallet-panel">
          <div className="wallet-summary-card">
            <span>Available balance</span>
            <strong>GHS {totalBalance.toFixed(2)}</strong>
            <small>{wallets.length > 1 ? `Across ${wallets.length} linked students` : `Status: ${primaryWallet?.status || 'active'}`}</small>
          </div>
          <div className="wallet-mini-grid">
            <div>
              <span>Wallets</span>
              <strong>{wallets.length}</strong>
            </div>
            <div>
              <span>Active</span>
              <strong>{activeWallets}</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>GHS</strong>
            </div>
          </div>

          <div className="wallet-list">
            {wallets.map(item => (
              <article key={item.id} className="wallet-detail-row">
                <div className="wallet-avatar">{`${item.first_name?.[0] || ''}${item.last_name?.[0] || ''}` || 'MHS'}</div>
                <div className="wallet-student">
                  <strong>{item.first_name || 'Student'} {item.last_name || ''}</strong>
                  <span>Student ID: {item.student_code || item.student_id || 'Assigned wallet'}</span>
                </div>
                <div className="wallet-balance">
                  <strong>GHS {Number(item.balance || 0).toFixed(2)}</strong>
                  <span>Ready for approved school purchases</span>
                </div>
                <span className={`wallet-status wallet-status-${item.status}`}>{item.status || 'active'}</span>
                {(user?.role === 'parent' || user?.role === 'admin') && (
                  <div className="spending-limit-form">
                    <div className="field">
                      <label htmlFor={`dailyLimit-${item.id}`}>Daily limit</label>
                      <input
                        id={`dailyLimit-${item.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={limits[item.student_internal_id || item.student_id]?.daily_limit ?? ''}
                        onChange={e => updateLimit(item.student_internal_id || item.student_id, 'daily_limit', e.target.value)}
                        placeholder="No daily limit"
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={`weeklyLimit-${item.id}`}>Weekly limit</label>
                      <input
                        id={`weeklyLimit-${item.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={limits[item.student_internal_id || item.student_id]?.weekly_limit ?? ''}
                        onChange={e => updateLimit(item.student_internal_id || item.student_id, 'weekly_limit', e.target.value)}
                        placeholder="No weekly limit"
                      />
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => saveLimit(item.student_internal_id || item.student_id)}
                      disabled={savingLimitId === (item.student_internal_id || item.student_id)}
                    >
                      {savingLimitId === (item.student_internal_id || item.student_id) ? 'Saving...' : 'Save limit'}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : (
        <div className="empty-state"><strong>Loading wallet</strong><span>Checking current coupon balance.</span></div>
      )}
    </div>
  )
}
