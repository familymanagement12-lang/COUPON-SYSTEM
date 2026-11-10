import React, { useContext, useEffect, useState } from 'react'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function Purchase(){
  const { user } = useContext(AuthContext)
  const [studentIdentifier, setStudentIdentifier] = useState('')
  const [amount, setAmount] = useState('')
  const [itemsDescription, setItemsDescription] = useState('')
  const [message, setMessage] = useState(null)
  const [studentLookup, setStudentLookup] = useState({ status: 'idle', student: null, error: null })

  useEffect(() => {
    let active = true
    const identifier = studentIdentifier.trim()
    if (identifier.replace(/[^a-zA-Z0-9]/g, '').length < 3) {
      setStudentLookup({ status: 'idle', student: null, error: null })
      return () => { active = false }
    }

    setStudentLookup({ status: 'loading', student: null, error: null })
    const timer = setTimeout(async () => {
      try {
        const response = await api.get('/students/lookup', { params: { studentId: identifier } })
        if (active) setStudentLookup({ status: 'found', student: response.data.data.student, error: null })
      } catch (requestError) {
        if (!active) return
        if (requestError.response?.status === 404) {
          setStudentLookup({ status: 'not-found', student: null, error: 'Student ID not found.' })
        } else {
          setStudentLookup({
            status: 'error',
            student: null,
            error: requestError.response?.data?.message || requestError.message
          })
        }
      }
    }, 300)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [studentIdentifier])

  const normalizedIdentifier = value => String(value || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  const matchedStudent = studentLookup.status === 'found'
    && normalizedIdentifier(studentLookup.student?.student_id) === normalizedIdentifier(studentIdentifier)
    ? studentLookup.student
    : null

  async function handleSubmit(e){
    e.preventDefault()
    setMessage(null)
    if (!matchedStudent || matchedStudent.wallet_status !== 'active') {
      setMessage('Enter a valid student ID with an active wallet before charging.')
      return
    }
    try{
      const res = await api.post('/purchases', { studentIdentifier: matchedStudent.student_id, amount: parseFloat(amount), itemsDescription })
      setMessage(res.data.message || 'Purchase successful')
      setStudentIdentifier('')
      setStudentLookup({ status: 'idle', student: null, error: null })
      setAmount('')
      setItemsDescription('')
    }catch(e){
      setMessage(e.response?.data?.message || e.message)
    }
  }

  return (
    <main className="container workspace vendor-workspace">
      <div className="page-heading"><div><p className="eyebrow">{user?.username || 'Vendor'} workspace</p><h1>Process a sale</h1><p className="lede">Charge a student wallet securely at the point of purchase.</p></div><div className="heading-mark">SALE</div></div>
      <form className="sale-form surface" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="purchaseStudent">Student unique ID</label>
          <input id="purchaseStudent" value={studentIdentifier} onChange={e=>setStudentIdentifier(e.target.value)} placeholder="e.g. STU1234567" autoComplete="off" required />
          {studentLookup.status === 'loading' && <small role="status">Looking up student...</small>}
          {matchedStudent && <small className="student-lookup-result" role="status">{matchedStudent.first_name} {matchedStudent.last_name}{matchedStudent.class ? ` · ${matchedStudent.class}` : ''}</small>}
          {studentLookup.error && <small className="student-lookup-error" role="status">{studentLookup.error}</small>}
          {studentLookup.status === 'found' && matchedStudent?.wallet_status !== 'active' && <small className="student-lookup-error" role="status">This student does not have an active wallet.</small>}
        </div>
        <div className="field"><label htmlFor="purchaseAmount">Amount (GHS)</label><input id="purchaseAmount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required /></div>
        <div className="field sale-description"><label htmlFor="purchaseDescription">Items description</label><input id="purchaseDescription" value={itemsDescription} onChange={e=>setItemsDescription(e.target.value)} placeholder="Lunch, exercise book, stationery..." /></div>
        <button className="primary-button" type="submit" disabled={!matchedStudent || matchedStudent.wallet_status !== 'active'}>Charge wallet</button>
      </form>
      {message && <p className={message.toLowerCase().includes('success') ? 'success' : 'error'}>{message}</p>}
    </main>
  )
}
