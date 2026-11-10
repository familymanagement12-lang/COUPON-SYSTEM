import React, { useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function Dashboard(){
  const { user } = useContext(AuthContext)
  const [wallet, setWallet] = useState(null)
  const [students, setStudents] = useState([])
  const [studentIdentifier, setStudentIdentifier] = useState('')
  const [lastName, setLastName] = useState('')
  const [linkError, setLinkError] = useState(null)
  const [linkMessage, setLinkMessage] = useState(null)

  useEffect(()=>{
    async function load(){
      try{
        const token = localStorage.getItem('accessToken')
        if (!token) return window.location.href = '/'
        if (user?.role === 'parent') {
          const children = await api.get('/parents/me/students')
          setStudents(children.data.data.students || [])
        } else {
          const res = await api.get('/wallets/me')
          setWallet(res.data.data)
        }
      }catch(e){
        console.error(e)
      }
    }
    load()
  },[user])

  async function linkStudent(e) {
    e.preventDefault()
    setLinkError(null)
    setLinkMessage(null)
    try {
      const response = await api.post('/parents/me/students', { studentIdentifier: studentIdentifier.trim(), lastName: lastName.trim() })
      const linkedStudent = response.data.data.student
      setStudents(current => current.some(student => student.id === linkedStudent.id)
        ? current
        : [...current, linkedStudent])
      setStudentIdentifier('')
      setLastName('')
      setLinkMessage('Student linked successfully.')
    } catch (e) {
      setLinkError(e.response?.data?.message || e.message)
    }
  }

  const adminWallets = wallet?.wallets || []
  const adminWalletSummary = adminWallets.reduce((summary, item) => {
    const balance = Number(item.balance || 0)
    return {
      totalBalance: summary.totalBalance + balance,
      active: summary.active + (item.status === 'active' ? 1 : 0),
      frozen: summary.frozen + (item.status === 'frozen' ? 1 : 0)
    }
  }, { totalBalance: 0, active: 0, frozen: 0 })

  return (
    <div className="container">
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">{user?.role || 'User'} dashboard</p>
          <h1>Dashboard</h1>
          <p className="lede">A quick view of wallet activity and account status.</p>
        </div>
      </div>
      {user?.role === 'parent' ? (
        <>
          <h3>Link a student</h3>
          <form onSubmit={linkStudent}>
            <input placeholder="Student ID" value={studentIdentifier} onChange={e => setStudentIdentifier(e.target.value)} required />
            <input placeholder="Student surname or full name" value={lastName} onChange={e => setLastName(e.target.value)} required />
            <button type="submit">Link student</button>
          </form>
          {linkError && <p className="error">{linkError}</p>}
          {linkMessage && <p>{linkMessage}</p>}
          <h3>Linked students</h3>
          {students.length ? students.map(student => (
            <p key={student.id || student.student_id}>{student.student_id} - {student.first_name || ''} {student.last_name}</p>
          )) : <p>No students linked yet.</p>}
        </>
      ) : wallet && (user?.role === 'admin' || user?.role === 'super_admin') ? (
        <section className="admin-section wallet-overview">
          <div className="directory-heading">
            <div>
              <h2>Wallet overview</h2>
              <p className="section-note">Latest wallet records and current balance totals.</p>
            </div>
          </div>
          <div className="admin-metric-grid">
            <div className="metric-card metric-accent">
              <span>Total wallets</span>
              <strong>{wallet.count || adminWallets.length}</strong>
              <small>Wallets currently loaded</small>
            </div>
            <div className="metric-card">
              <span>Total balance</span>
              <strong>GHS {adminWalletSummary.totalBalance.toFixed(2)}</strong>
              <small>Across visible wallets</small>
            </div>
            <div className="metric-card">
              <span>Active</span>
              <strong>{adminWalletSummary.active}</strong>
              <small>Ready for purchases</small>
            </div>
            <div className="metric-card">
              <span>Needs attention</span>
              <strong>{adminWalletSummary.frozen}</strong>
              <small>Frozen wallets</small>
            </div>
          </div>
          <div className="wallet-snapshot-list">
            {adminWallets.slice(0, 5).map(item => (
              <article className="wallet-snapshot-row" key={item.id}>
                <div className="wallet-avatar">{`${item.first_name?.[0] || ''}${item.last_name?.[0] || ''}` || 'SW'}</div>
                <div className="wallet-student">
                  <strong>{item.first_name} {item.last_name}</strong>
                  <span>{item.student_code || item.student_id} · {item.email}</span>
                </div>
                <div className="wallet-balance">
                  <strong>GHS {Number(item.balance || 0).toFixed(2)}</strong>
                  <span>Updated {item.updated_at ? new Date(item.updated_at).toLocaleDateString() : 'today'}</span>
                </div>
                <span className={`wallet-status wallet-status-${item.status}`}>{item.status}</span>
              </article>
            ))}
            {!adminWallets.length && (
              <div className="empty-state compact-empty">
                <strong>No wallets yet</strong>
                <span>Student wallets will appear here after onboarding.</span>
              </div>
            )}
          </div>
        </section>
      ) : wallet ? (
        <section className="admin-section wallet-overview">
          <div className="metric-card metric-accent student-balance-card">
            <span>Wallet balance</span>
            <strong>GHS {Number(wallet.balance || 0).toFixed(2)}</strong>
            <small>Status: {wallet.status || 'active'}</small>
          </div>
        </section>
      ) : (
        <p>Loading wallet...</p>
      )}
    </div>
  )
}
