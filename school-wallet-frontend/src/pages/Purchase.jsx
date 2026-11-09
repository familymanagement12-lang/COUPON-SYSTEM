import React, { useContext, useState } from 'react'
import api from '../services/api'
import { AuthContext } from '../context/AuthContext'

export default function Purchase(){
  const { user } = useContext(AuthContext)
  const [studentIdentifier, setStudentIdentifier] = useState('')
  const [amount, setAmount] = useState('')
  const [itemsDescription, setItemsDescription] = useState('')
  const [message, setMessage] = useState(null)

  async function handleSubmit(e){
    e.preventDefault()
    setMessage(null)
    try{
      const res = await api.post('/purchases', { studentIdentifier, amount: parseFloat(amount), itemsDescription })
      setMessage(res.data.message || 'Purchase successful')
      setStudentIdentifier('')
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
        <div className="field"><label htmlFor="purchaseStudent">Student unique ID</label><input id="purchaseStudent" value={studentIdentifier} onChange={e=>setStudentIdentifier(e.target.value)} placeholder="e.g. STU1234567" required /></div>
        <div className="field"><label htmlFor="purchaseAmount">Amount (GHS)</label><input id="purchaseAmount" type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" required /></div>
        <div className="field sale-description"><label htmlFor="purchaseDescription">Items description</label><input id="purchaseDescription" value={itemsDescription} onChange={e=>setItemsDescription(e.target.value)} placeholder="Lunch, exercise book, stationery..." /></div>
        <button className="primary-button" type="submit">Charge wallet</button>
      </form>
      {message && <p className={message.toLowerCase().includes('success') ? 'success' : 'error'}>{message}</p>}
    </main>
  )
}
