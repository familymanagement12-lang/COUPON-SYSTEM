import React, { useEffect, useState } from 'react'
import api from '../services/api'

const emptyAccount = {
  firstName: '',
  lastName: '',
  username: '',
  email: '',
  phone: '',
  role: 'vendor',
  password: '',
  confirmPassword: ''
}

const emptyStudent = { studentId: '', firstName: '', lastName: '', className: '', dateOfBirth: '' }

function parseCsv(text) {
  const rows = []
  let row = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const nextCharacter = text[index + 1]

    if (character === '"' && quoted && nextCharacter === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(value.trim())
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') index += 1
      row.push(value.trim())
      if (row.some(Boolean)) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  row.push(value.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

export default function SuperAdmin() {
  const [account, setAccount] = useState(emptyAccount)
  const [students, setStudents] = useState([{ ...emptyStudent }])
  const [studentDirectory, setStudentDirectory] = useState([])
  const [walletSnapshot, setWalletSnapshot] = useState([])
  const [accountMessage, setAccountMessage] = useState(null)
  const [studentMessage, setStudentMessage] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const walletSummary = walletSnapshot.reduce((summary, wallet) => {
    const balance = Number(wallet.balance || 0)
    return {
      totalBalance: summary.totalBalance + balance,
      active: summary.active + (wallet.status === 'active' ? 1 : 0),
      frozen: summary.frozen + (wallet.status === 'frozen' ? 1 : 0),
      closed: summary.closed + (wallet.status === 'closed' ? 1 : 0)
    }
  }, { totalBalance: 0, active: 0, frozen: 0, closed: 0 })

  async function loadWalletSnapshot() {
    try {
      const response = await api.get('/wallets?limit=5')
      setWalletSnapshot(response.data.data.wallets || [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    }
  }

  async function loadStudentDirectory() {
    try {
      const response = await api.get('/students?limit=500')
      setStudentDirectory(response.data.data.students || [])
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    }
  }

  useEffect(() => {
    loadWalletSnapshot()
    loadStudentDirectory()
  }, [])

  function updateAccount(field, value) {
    setAccount(current => ({ ...current, [field]: value }))
  }

  function updateStudent(index, field, value) {
    setStudents(current => current.map((student, studentIndex) => (
      studentIndex === index ? { ...student, [field]: value } : student
    )))
  }

  function addStudentRow() {
    setStudents(current => [...current, { ...emptyStudent }])
  }

  function removeStudentRow(index) {
    setStudents(current => current.filter((_, studentIndex) => studentIndex !== index))
  }

  async function loadCsv(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    try {
      const rows = parseCsv(await file.text())
      if (rows.length < 2) throw new Error('The CSV must include a header row and at least one student.')

      const headers = rows[0].map(header => header.toLowerCase().replace(/[^a-z]/g, ''))
      const column = name => headers.indexOf(name)
      if (column('firstname') === -1 || column('lastname') === -1) {
        throw new Error('CSV headers must include firstName and lastName.')
      }

      setStudents(rows.slice(1).map(row => ({
        studentId: row[column('studentid')] || '',
        firstName: row[column('firstname')] || '',
        lastName: row[column('lastname')] || '',
        className: row[column('classname')] || '',
        dateOfBirth: row[column('dateofbirth')] || ''
      })))
      setStudentMessage(`${rows.length - 1} student row(s) loaded for review.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      event.target.value = ''
    }
  }

  function downloadTemplate() {
    const blob = new Blob(['studentId,firstName,lastName,className,dateOfBirth\n, Ama, Mensah, JHS 1,\n'], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'students-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  async function createAccount(event) {
    event.preventDefault()
    setError(null)
    setAccountMessage(null)
    setLoading(true)
    try {
      const response = await api.post('/auth/register', account)
      setAccountMessage(`${account.role} account created for ${response.data.data.user.email}.`)
      setAccount(emptyAccount)
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function importStudents(event) {
    event.preventDefault()
    setError(null)
    setStudentMessage(null)
    setLoading(true)
    try {
      const incompleteRow = students.findIndex(student => !student.firstName.trim() || !student.lastName.trim())
      if (incompleteRow !== -1) {
        throw new Error(`Complete the first name and last name on row ${incompleteRow + 1}.`)
      }

      const suppliedIds = students.map(student => student.studentId.trim()).filter(Boolean)
      if (new Set(suppliedIds).size !== suppliedIds.length) {
        throw new Error('Student IDs must be unique.')
      }

      const response = await api.post('/students/import', {
        students: students.map(student => ({
          ...student,
          studentId: student.studentId.trim() || undefined
        }))
      })
      setStudentMessage(`${response.data.data.count} student(s) onboarded successfully.`)
      setStudents([{ ...emptyStudent }])
      await loadStudentDirectory()
      await loadWalletSnapshot()
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="container admin-portal">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">Super admin control</p>
          <h1>McCarthy Hill operations</h1>
        </div>
        <span className="admin-badge">Full access</span>
      </div>

      <section className="admin-section wallet-overview">
        <div className="directory-heading">
          <div>
            <h2>Wallet snapshot</h2>
            <p className="section-note">Latest 5 student wallets with live balance and status information.</p>
          </div>
          <button className="secondary-button" type="button" onClick={loadWalletSnapshot}>Refresh wallets</button>
        </div>

        <div className="admin-metric-grid">
          <div className="metric-card metric-accent">
            <span>Visible wallets</span>
            <strong>{walletSnapshot.length}</strong>
            <small>Showing the newest 5 only</small>
          </div>
          <div className="metric-card">
            <span>Shown balance</span>
            <strong>GHS {walletSummary.totalBalance.toFixed(2)}</strong>
            <small>Total across these wallets</small>
          </div>
          <div className="metric-card">
            <span>Active wallets</span>
            <strong>{walletSummary.active}</strong>
            <small>{walletSummary.frozen + walletSummary.closed} need attention</small>
          </div>
          <div className="metric-card">
            <span>Students onboarded</span>
            <strong>{studentDirectory.length}</strong>
            <small>Records in the directory</small>
          </div>
        </div>

        <div className="wallet-snapshot-list">
          {walletSnapshot.map(wallet => (
            <article className="wallet-snapshot-row" key={wallet.id}>
              <div className="wallet-avatar">{`${wallet.first_name?.[0] || ''}${wallet.last_name?.[0] || ''}` || 'SW'}</div>
              <div className="wallet-student">
                <strong>{wallet.first_name} {wallet.last_name}</strong>
                <span>{wallet.student_id} · {wallet.email}</span>
              </div>
              <div className="wallet-balance">
                <strong>GHS {Number(wallet.balance || 0).toFixed(2)}</strong>
                <span>Updated {wallet.updated_at ? new Date(wallet.updated_at).toLocaleDateString() : 'today'}</span>
              </div>
              <span className={`wallet-status wallet-status-${wallet.status}`}>{wallet.status}</span>
            </article>
          ))}
          {!walletSnapshot.length && (
            <div className="empty-state compact-empty">
              <strong>No wallets yet</strong>
              <span>Imported students will appear here once wallets are created.</span>
            </div>
          )}
        </div>
      </section>

      <div className="admin-grid">
        <section className="admin-section">
          <h2>Create an account</h2>
          <p className="section-note">Create a vendor or another administrator from this protected portal.</p>
          <form className="auth-form" onSubmit={createAccount}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="accountRole">Account type</label>
                <select id="accountRole" value={account.role} onChange={e => updateAccount('role', e.target.value)}>
                  <option value="vendor">Vendor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="accountUsername">Username</label>
                <input id="accountUsername" required value={account.username} onChange={e => updateAccount('username', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="accountEmail">Email</label>
                <input id="accountEmail" type="email" required value={account.email} onChange={e => updateAccount('email', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="accountPhone">Phone</label>
                <input id="accountPhone" value={account.phone} onChange={e => updateAccount('phone', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="accountPassword">Password</label>
                <input id="accountPassword" type="password" minLength="8" required value={account.password} onChange={e => updateAccount('password', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="accountConfirmPassword">Confirm password</label>
                <input id="accountConfirmPassword" type="password" minLength="8" required value={account.confirmPassword} onChange={e => updateAccount('confirmPassword', e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={loading}>Create account</button>
          </form>
        </section>

        <section className="admin-section">
          <h2>Onboard students</h2>
          <p className="section-note">Add one row per student. Leave the ID blank to generate a unique ID automatically.</p>
          <form className="auth-form" onSubmit={importStudents}>
            <div className="upload-actions">
              <label className="file-button" htmlFor="studentCsv">Upload CSV</label>
              <input id="studentCsv" className="hidden-file-input" type="file" accept=".csv,text/csv" onChange={loadCsv} />
              <button className="secondary-button" type="button" onClick={downloadTemplate}>Download template</button>
            </div>
            <div className="student-table-wrap">
              <table className="student-table">
                <thead>
                  <tr>
                    <th>Student ID</th>
                    <th>First name</th>
                    <th>Last name</th>
                    <th>Class</th>
                    <th>Date of birth</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {students.map((student, index) => (
                    <tr key={index}>
                      <td><input aria-label={`Student ${index + 1} ID`} value={student.studentId} onChange={e => updateStudent(index, 'studentId', e.target.value)} placeholder="Auto" /></td>
                      <td><input aria-label={`Student ${index + 1} first name`} value={student.firstName} onChange={e => updateStudent(index, 'firstName', e.target.value)} required /></td>
                      <td><input aria-label={`Student ${index + 1} last name`} value={student.lastName} onChange={e => updateStudent(index, 'lastName', e.target.value)} required /></td>
                      <td><input aria-label={`Student ${index + 1} class`} value={student.className} onChange={e => updateStudent(index, 'className', e.target.value)} /></td>
                      <td><input aria-label={`Student ${index + 1} date of birth`} type="date" value={student.dateOfBirth} onChange={e => updateStudent(index, 'dateOfBirth', e.target.value)} /></td>
                      <td><button className="remove-row" type="button" onClick={() => removeStudentRow(index)} disabled={students.length === 1} aria-label={`Remove student ${index + 1}`}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="secondary-button" type="button" onClick={addStudentRow}>Add student row</button>
            <button type="submit" disabled={loading}>Import students</button>
          </form>
        </section>
      </div>

      <section className="admin-section student-directory">
        <div className="directory-heading">
          <div>
            <h2>Student directory</h2>
            <p className="section-note">Unique IDs and current student records.</p>
          </div>
          <button className="secondary-button" type="button" onClick={loadStudentDirectory}>Refresh list</button>
        </div>
        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr><th>Unique ID</th><th>Name</th><th>Class</th><th>Email</th><th>Wallet</th><th>Status</th></tr>
            </thead>
            <tbody>
              {studentDirectory.map(student => (
                <tr key={student.id}>
                  <td><strong>{student.student_id}</strong></td>
                  <td>{student.first_name} {student.last_name}</td>
                  <td>{student.class || '-'}</td>
                  <td>{student.email}</td>
                  <td>GHS {student.balance || '0.00'}</td>
                  <td>{student.status}</td>
                </tr>
              ))}
              {!studentDirectory.length && <tr><td colSpan="6">No students onboarded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {accountMessage && <p className="success">{accountMessage}</p>}
      {studentMessage && <p className="success">{studentMessage}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}
