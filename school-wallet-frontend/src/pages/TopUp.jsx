import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../services/api'

export default function TopUp(){
  const navigate = useNavigate()
  const [methods, setMethods] = useState([])
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('paystack')
  const [studentId, setStudentId] = useState(null)
  const [wallets, setWallets] = useState([])
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const presetAmounts = [10, 20, 50, 100]
  const selectedWallet = wallets.find(wallet => String(wallet.student_internal_id || wallet.student_id) === String(studentId))
  const selectedMethod = methods.find(item => item.provider === method)

  async function loadWallets() {
    const walletResponse = await api.get('/wallets/me')
    const walletData = walletResponse.data.data
    const studentWallets = Array.isArray(walletData) ? walletData : walletData ? [walletData] : []
    setWallets(studentWallets)
    if (!studentId && studentWallets[0]) setStudentId(studentWallets[0].student_internal_id)
    return studentWallets
  }

  async function verifyPayment(reference) {
    try {
      const response = await api.get(`/topups/verify/${encodeURIComponent(reference)}`)
      await loadWallets()
      const newBalance = Number(response.data.data.newBalance || 0).toFixed(2)
      sessionStorage.setItem('walletMessage', `Payment completed. Balance updated to GHS ${newBalance}.`)
      navigate('/wallet', { replace: true })
    } catch (e) {
      setMessage(e.response?.data?.message || e.message)
      await loadWallets()
    }
  }

  useEffect(()=>{
    async function load(){
      setLoading(true)
      try{
        const params = new URLSearchParams(window.location.search)
        const reference = params.get('reference') || params.get('trxref')
        const res = await api.get('/topups/methods')
        const availableMethods = res.data.data.methods || []
        setMethods(availableMethods)
        if (availableMethods.some(m => m.provider === 'paystack')) setMethod('paystack')
        if (reference) {
          await verifyPayment(reference)
        } else {
          await loadWallets()
        }
      }catch(e){
        setMessage(e.response?.data?.message || e.message)
      }finally{
        setLoading(false)
      }
    }
    load()
  },[])

  async function handleSubmit(e){
    e.preventDefault()
    setMessage(null)
    setSubmitting(true)
    try{
      if (!studentId) {
        setMessage('Select a student wallet before topping up')
        return
      }
      const res = await api.post('/topups', { studentId, amount: parseFloat(amount), paymentMethod: method })
      if (res.data.data?.paymentUrl) {
        window.location.href = res.data.data.paymentUrl
      } else {
        setMessage(res.data.message || 'Top-up initiated')
      }
    }catch(e){
      setMessage(e.response?.data?.message || e.message)
    }finally{
      setSubmitting(false)
    }
  }

  return (
    <main className="container topup-page">
      <div className="page-heading wallet-page-heading">
        <div>
          <p className="eyebrow">McCarthy Hill coupons</p>
          <h1>Top Up Wallet</h1>
          <p className="lede">Add funds to a student coupon wallet for approved school purchases.</p>
        </div>
        <Link className="secondary-button button-link" to="/wallet">Back to wallet</Link>
      </div>

      {loading ? (
        <div className="empty-state"><strong>Loading wallets</strong><span>Preparing available student wallets.</span></div>
      ) : (
        <section className="topup-layout">
          <form className="topup-form surface" onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="topupStudent">Student wallet</label>
              <select id="topupStudent" value={studentId || ''} onChange={e=>setStudentId(e.target.value)} required>
                {wallets.map(w=> (
                  <option key={w.id} value={w.student_internal_id || w.student_id}>
                    {w.first_name} {w.last_name} ({w.student_code || w.student_id})
                  </option>
                ))}
              </select>
            </div>

            <div className="amount-picker">
              <label htmlFor="topupAmount">Amount (GHS)</label>
              <div className="amount-chips">
                {presetAmounts.map(value => (
                  <button className={Number(amount) === value ? 'amount-chip active' : 'amount-chip'} type="button" key={value} onClick={() => setAmount(String(value))}>GHS {value}</button>
                ))}
              </div>
              <input id="topupAmount" type="number" min="1" max="10000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Enter another amount" required />
            </div>

            <div className="field">
              <label htmlFor="paymentMethod">Payment method</label>
              <select id="paymentMethod" value={method} onChange={e=>setMethod(e.target.value)}>
                {methods.map(m=> <option key={m.provider} value={m.provider}>{m.name}</option>)}
              </select>
            </div>

            <button className="primary-button" type="submit" disabled={submitting || !wallets.length}>{submitting ? 'Starting payment...' : 'Continue to payment'}</button>
            {message && <p className={message.toLowerCase().includes('completed') ? 'success' : 'error'}>{message}</p>}
          </form>

          <aside className="topup-summary">
            <div className="wallet-summary-card">
              <span>Selected wallet</span>
              <strong>GHS {Number(selectedWallet?.balance || 0).toFixed(2)}</strong>
              <small>{selectedWallet ? `${selectedWallet.first_name} ${selectedWallet.last_name} - ${selectedWallet.student_code || selectedWallet.student_id}` : 'No wallet selected'}</small>
            </div>
            <div className="topup-note surface">
              <span>Payment</span>
              <strong>{selectedMethod?.name || 'Payment method'}</strong>
              <small>After confirmation, the wallet balance updates automatically.</small>
            </div>
          </aside>
        </section>
      )}
    </main>
  )
}
