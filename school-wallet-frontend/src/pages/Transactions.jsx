import React, { useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function Transactions(){
  const { user } = useContext(AuthContext)
  const [txs, setTxs] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')

  async function loadTransactions(){
    setLoading(true)
    setError(null)
    try{
      let studentIds = []
      const studentMeta = new Map()
      if (user?.role === 'parent') {
        const linked = await api.get('/parents/me/students')
        const students = linked.data.data.students || []
        students.forEach(student => studentMeta.set(student.id, student))
        studentIds = students.map(student => student.id)
      } else {
        const walletResponse = await api.get('/wallets/me')
        const walletData = walletResponse.data.data
        const wallets = Array.isArray(walletData) ? walletData : [walletData]
        wallets.filter(Boolean).forEach(wallet => studentMeta.set(wallet.student_id, wallet))
        studentIds = wallets.map(wallet => wallet.student_id).filter(Boolean)
      }

      if (!studentIds.length) {
        setTxs([])
        setError('No students linked')
        return
      }

      const responses = await Promise.all(studentIds.map(studentId => api.get(`/transactions/history?studentId=${studentId}`)))
      const transactions = responses.flatMap(response => response.data.data.transactions || []).map(transaction => ({
        ...transaction,
        student: studentMeta.get(transaction.student_id)
      }))
      transactions.sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
      setTxs(transactions)
    }catch(e){
      setError(e.response?.data?.message || e.message)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    if (user) loadTransactions()
  },[user])

  const filteredTransactions = txs.filter(transaction => {
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter
    const haystack = `${transaction.transaction_id || ''} ${transaction.student?.student_id || ''} ${transaction.description || ''}`.toLowerCase()
    return matchesType && matchesStatus && haystack.includes(search.toLowerCase())
  })
  const totalCredits = filteredTransactions.reduce((sum, transaction) => {
    const isCredit = transaction.type === 'topup' || transaction.type === 'refund' || transaction.type === 'adjustment'
    return sum + (isCredit ? Number(transaction.amount || 0) : 0)
  }, 0)
  const totalDebits = filteredTransactions.reduce((sum, transaction) => transaction.type === 'purchase' ? sum + Number(transaction.amount || 0) : sum, 0)
  const netChange = totalCredits - totalDebits
  const completedCount = txs.filter(transaction => transaction.status === 'completed').length

  return (
    <main className="container workspace transactions-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Coupon activity</p>
          <h1>Transactions</h1>
          <p className="lede">Track top-ups, purchases, refunds, and adjustments across linked student wallets.</p>
        </div>
        <button className="secondary-button refresh-button" onClick={loadTransactions} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      <div className="metric-grid transaction-metrics">
        <div className="metric-card"><span>Records</span><strong>{txs.length}</strong><small>Across linked wallets</small></div>
        <div className="metric-card metric-accent"><span>Completed</span><strong>{completedCount}</strong><small>Confirmed wallet activity</small></div>
        <div className="metric-card"><span>Net movement</span><strong>GHS {netChange.toFixed(2)}</strong><small>Credits GHS {totalCredits.toFixed(2)} / Spent GHS {totalDebits.toFixed(2)}</small></div>
      </div>

      <section className="surface transactions-surface">
        <div className="transaction-toolbar">
          <div className="filter-tabs">
            {['all', 'topup', 'purchase', 'refund'].map(type => <button key={type} className={typeFilter === type ? 'filter-tab active' : 'filter-tab'} onClick={() => setTypeFilter(type)}>{type === 'all' ? 'All activity' : type}</button>)}
          </div>
          <div className="transaction-filters">
            <input aria-label="Search transactions" placeholder="Search ID or description" value={search} onChange={e => setSearch(e.target.value)} />
            <select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="completed">Completed</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {loading ? <div className="empty-state"><strong>Loading transactions</strong><span>Checking each linked student wallet.</span></div> : !error && !filteredTransactions.length ? <div className="empty-state"><strong>No matching transactions</strong><span>New wallet activity will appear here automatically.</span></div> : <div className="transaction-list">{filteredTransactions.map(transaction => {
          const isCredit = transaction.type === 'topup' || transaction.type === 'refund' || transaction.type === 'adjustment'
          return <article className="transaction-row" key={`${transaction.id}-${transaction.student_id}`}><div className={`transaction-icon ${isCredit ? 'credit' : 'debit'}`}>{isCredit ? '+' : '-'}</div><div className="transaction-main"><strong>{transaction.description || `${transaction.type} transaction`}</strong><span>{transaction.student?.student_id || `Student ${transaction.student_id}`} / {new Date(transaction.created_at).toLocaleString()}</span></div><div className="transaction-status"><span className={`status-pill status-${transaction.status}`}>{transaction.status}</span><strong className={isCredit ? 'amount-credit' : 'amount-debit'}>{isCredit ? '+' : '-'} GHS {Number(transaction.amount || 0).toFixed(2)}</strong></div></article>
        })}</div>}
      </section>
    </main>
  )
}
