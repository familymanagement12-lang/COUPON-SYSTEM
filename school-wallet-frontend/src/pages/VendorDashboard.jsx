import React, { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function VendorDashboard(){
  const { user } = useContext(AuthContext)
  const [txs, setTxs] = useState([])
  const [summary, setSummary] = useState({ completedSales: 0, totalEarnings: 0, todayEarnings: 0, todaySales: 0, averageSale: 0 })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  async function loadTransactions(){
    if (!user?.vendorId) return
    setLoading(true)
    try{
      const [summaryResponse, transactionResponse] = await Promise.all([
        api.get(`/vendors/${user.vendorId}/summary`),
        api.get(`/vendors/${user.vendorId}/transactions`, { params: { limit: 50, offset: 0 } })
      ])
      setSummary(summaryResponse.data.data)
      setTxs(transactionResponse.data.data.transactions || [])
    }catch(e){ setError(e.response?.data?.message || e.message) } finally { setLoading(false) }
  }

  useEffect(()=>{ loadTransactions() }, [user])
  return (
    <main className="container workspace vendor-workspace">
      <div className="page-heading"><div><p className="eyebrow">Vendor workspace</p><h1>Good business, clearly tracked.</h1><p className="lede">Monitor wallet sales and keep the school line moving.</p></div><Link className="primary-button button-link" to="/purchase">Start a sale</Link></div>
      <div className="metric-grid"><div className="metric-card metric-accent"><span>Total earnings</span><strong>GHS {Number(summary.totalEarnings || 0).toFixed(2)}</strong><small>All completed purchases</small></div><div className="metric-card"><span>Today</span><strong>GHS {Number(summary.todayEarnings || 0).toFixed(2)}</strong><small>{summary.todaySales || 0} completed sales today</small></div><div className="metric-card"><span>Average sale</span><strong>GHS {Number(summary.averageSale || 0).toFixed(2)}</strong><small>{summary.completedSales || 0} completed sales overall</small></div></div>
      <section className="surface transaction-surface"><div className="section-header"><div><p className="eyebrow">Activity</p><h2>Recent transactions</h2></div><button className="secondary-button" onClick={loadTransactions}>Refresh</button></div>{error && <p className="error">{error}</p>}{loading ? <p className="muted">Loading activity...</p> : txs.length ? <div className="activity-list">{txs.map(tx => <div className="activity-row" key={tx.id || tx.transaction_id}><div><strong>{tx.student_name || 'Student wallet'}</strong><span>Student ID: {tx.student_identifier || tx.student_id || 'Unavailable'}</span><span>{tx.items_description || tx.description || tx.type}</span></div><div className="activity-amount">GHS {Number(tx.amount || 0).toFixed(2)}<span>{new Date(tx.created_at).toLocaleDateString()}</span></div></div>)}</div> : <p className="muted">No transactions yet. Completed sales will appear here.</p>}</section>
    </main>
  )
}
