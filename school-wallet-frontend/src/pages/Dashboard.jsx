import React, { useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'
import loadAllAdminWallets from '../utils/loadAllAdminWallets'

export default function Dashboard(){
  const { user } = useContext(AuthContext)
  const [wallet, setWallet] = useState(null)
  const [students, setStudents] = useState([])
  const [studentLinks, setStudentLinks] = useState([{ studentIdentifier: '' }])
  const [studentPreviews, setStudentPreviews] = useState({})
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
          const wallets = user?.role === 'admin' || user?.role === 'super_admin'
            ? await loadAllAdminWallets()
            : (await api.get('/wallets/me')).data.data
          setWallet(user?.role === 'admin' || user?.role === 'super_admin' ? {
            ...wallets,
            count: wallets.totalCount,
            wallets: wallets.wallets
          } : wallets)
        }
      }catch(e){
        console.error(e)
      }
    }
    load()
  },[user])

  useEffect(() => {
    let cancelled = false
    const timeout = setTimeout(async () => {
      const previews = await Promise.all(studentLinks.map(async student => {
        const studentIdentifier = student.studentIdentifier.trim()
        if (studentIdentifier.replace(/[^a-zA-Z0-9]/g, '').length < 3) return null
        try {
          const response = await api.get('/parents/me/students/lookup', { params: { studentId: studentIdentifier } })
          return response.data.data.student
        } catch {
          return null
        }
      }))
      if (!cancelled) {
        setStudentPreviews(Object.fromEntries(previews.map((student, index) => [
          index,
          student ? { studentIdentifier: studentLinks[index].studentIdentifier.trim(), student } : null
        ]).filter(([, preview]) => preview)))
      }
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [studentLinks])

  async function linkStudent(e) {
    e.preventDefault()
    setLinkError(null)
    setLinkMessage(null)
    const requestedStudents = studentLinks
      .map(student => ({
        studentIdentifier: student.studentIdentifier.trim()
      }))
      .filter(student => student.studentIdentifier)

    if (!requestedStudents.length) {
      setLinkError('Enter a student ID for each child.')
      return
    }

    try {
      const response = await api.post('/parents/me/students', { students: requestedStudents })
      const { linkedCount, results } = response.data.data
      const linkedStudents = response.data.data.students || []
      setStudents(current => {
        const byId = new Map(current.map(student => [student.id, student]))
        linkedStudents.forEach(student => byId.set(student.id, student))
        return [...byId.values()]
      })
      const failures = (results || []).filter(result => result.status !== 'linked')
      setStudentLinks(failures.map(result => {
        const requested = requestedStudents[result.row - 1]
        return requested || { studentIdentifier: '' }
      }))
      if (!failures.length) setStudentLinks([{ studentIdentifier: '' }])
      setLinkMessage(`${linkedCount} child${linkedCount === 1 ? '' : 'ren'} linked successfully.${failures.length ? ` ${failures.length} row(s) need attention.` : ''}`)
      if (failures.length) setLinkError(failures.map(result => `Row ${result.row}: ${result.message}`).join(' '))
    } catch (e) {
      setLinkError(e.response?.data?.message || e.message)
    }
  }

  function updateStudentLink(index, field, value) {
    setStudentLinks(current => current.map((student, studentIndex) => (
      studentIndex === index ? { ...student, [field]: value } : student
    )))
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
          <section className="admin-section parent-children-section">
            <h2>Add your children</h2>
            <p className="section-note">Enter each student's ID to look up their name, then link the matched student.</p>
            <form className="auth-form" onSubmit={linkStudent}>
              {studentLinks.map((student, index) => (
                <div className="form-grid parent-child-row" key={index}>
                  <div className="field">
                    <label htmlFor={`childStudentId-${index}`}>Student ID</label>
                    <input id={`childStudentId-${index}`} placeholder="Student ID" value={student.studentIdentifier} onChange={e => updateStudentLink(index, 'studentIdentifier', e.target.value)} required />
                    {studentPreviews[index]?.studentIdentifier === student.studentIdentifier.trim() && <small className="student-link-preview" aria-live="polite">{studentPreviews[index].student.first_name} {studentPreviews[index].student.last_name}</small>}
                  </div>
                  {studentLinks.length > 1 && <button className="remove-row parent-child-remove" type="button" onClick={() => setStudentLinks(current => current.filter((_, studentIndex) => studentIndex !== index))}>Remove</button>}
                </div>
              ))}
              <div className="upload-actions">
                <button className="secondary-button" type="button" onClick={() => setStudentLinks(current => [...current, { studentIdentifier: '' }])}>Add another child</button>
                <button type="submit">Link children</button>
              </div>
            </form>
            {linkError && <p className="error">{linkError}</p>}
            {linkMessage && <p className="success">{linkMessage}</p>}
          </section>
          <h3>Linked children ({students.length})</h3>
          {students.length ? students.map(student => (
            <p key={student.id || student.student_id}>{student.student_id} - {student.first_name || ''} {student.last_name}</p>
          )) : <p>No children linked yet.</p>}
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
              <small>Across all student wallets</small>
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
