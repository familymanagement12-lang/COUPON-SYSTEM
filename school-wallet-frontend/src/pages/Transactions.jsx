import React, { useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'
import isSuperAdminUser from '../utils/isSuperAdmin'

export default function Transactions(){
  const { user } = useContext(AuthContext)
  const [txs, setTxs] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const isSuperAdmin = isSuperAdminUser(user)
  const pageSize = 100

  async function loadTransactions(){
    setLoading(true)
    setError(null)
    try{
      if (isSuperAdmin) {
        const response = await api.get('/transactions/all', {
          params: { limit: pageSize, offset }
        })
        const data = response.data.data
        setTxs(data.transactions || [])
        setTotalCount(data.totalCount || 0)
        return
      }

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
        setTotalCount(0)
        setError('No students linked')
        return
      }

      const response = await api.get('/transactions/history', {
        params: { studentIds: studentIds.join(',') }
      })
      const transactions = (response.data.data.transactions || []).map(transaction => ({
        ...transaction,
        student: studentMeta.get(transaction.student_id)
      }))
      transactions.sort((left, right) => new Date(right.created_at) - new Date(left.created_at))
      setTxs(transactions)
      setTotalCount(transactions.length)
    }catch(e){
      setError(e.response?.data?.message || e.message)
    }finally{
      setLoading(false)
    }
  }

  useEffect(()=>{
    if (user) loadTransactions()
  },[user, offset])

  const filteredTransactions = txs.filter(transaction => {
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter
    const matchesStatus = statusFilter === 'all' || transaction.status === statusFilter
    const haystack = `${transaction.transaction_id || ''} ${transaction.student_code || transaction.student?.student_id || ''} ${transaction.description || ''} ${transaction.items_description || ''} ${transaction.vendor_name || ''}`.toLowerCase()
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
          <p className="lede">{isSuperAdmin
            ? 'Review all student wallet transactions, including purchase details and vendors.'
            : 'Track top-ups, purchases, refunds, and adjustments across linked student wallets.'}</p>
        </div>
        <button className="secondary-button refresh-button" onClick={loadTransactions} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      <div className="metric-grid transaction-metrics">
        <div className="metric-card"><span>Records</span><strong>{isSuperAdmin ? totalCount : txs.length}</strong><small>{isSuperAdmin ? 'Across all student wallets' : 'Across linked wallets'}</small></div>
        <div className="metric-card metric-accent"><span>Completed on this page</span><strong>{completedCount}</strong><small>Confirmed wallet activity</small></div>
        <div className="metric-card"><span>Net movement on this page</span><strong>GHS {netChange.toFixed(2)}</strong><small>Credits GHS {totalCredits.toFixed(2)} / Spent GHS {totalDebits.toFixed(2)}</small></div>
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
        {loading ? <div className="empty-state"><strong>Loading transactions</strong><span>{isSuperAdmin ? 'Loading all student wallet activity.' : 'Checking each linked student wallet.'}</span></div> : !error && !filteredTransactions.length ? <div className="empty-state"><strong>No matching transactions</strong><span>New wallet activity will appear here automatically.</span></div> : <div className="transaction-list">{filteredTransactions.map(transaction => {
          const isCredit = transaction.type === 'topup' || transaction.type === 'refund' || transaction.type === 'adjustment'
          const studentName = [transaction.first_name || transaction.student?.first_name, transaction.last_name || transaction.student?.last_name].filter(Boolean).join(' ')
          const studentCode = transaction.student_code || transaction.student?.student_id
          const usage = transaction.items_description || transaction.description || `${transaction.type} transaction`
          return <article className="transaction-row" key={`${transaction.id}-${transaction.student_id}`}><div className={`transaction-icon ${isCredit ? 'credit' : 'debit'}`}>{isCredit ? '+' : '-'}</div><div className="transaction-main"><strong>{usage}</strong><span>{studentName ? `${studentName} · ` : ''}{studentCode || `Student ${transaction.student_id}`}{transaction.vendor_name ? ` · ${transaction.vendor_name}` : ''} / {new Date(transaction.created_at).toLocaleString()}</span></div><div className="transaction-status"><span className={`status-pill status-${transaction.status}`}>{transaction.status}</span><strong className={isCredit ? 'amount-credit' : 'amount-debit'}>{isCredit ? '+' : '-'} GHS {Number(transaction.amount || 0).toFixed(2)}</strong></div></article>
        })}</div>}
        {isSuperAdmin && totalCount > pageSize && (
          <div className="transaction-toolbar">
            <span>Showing {offset + 1}-{Math.min(offset + txs.length, totalCount)} of {totalCount}</span>
            <div className="transaction-filters">
              <button className="secondary-button" type="button" onClick={() => setOffset(Math.max(offset - pageSize, 0))} disabled={loading || offset === 0}>Previous</button>
              <button className="secondary-button" type="button" onClick={() => setOffset(offset + pageSize)} disabled={loading || offset + pageSize >= totalCount}>Next</button>
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
