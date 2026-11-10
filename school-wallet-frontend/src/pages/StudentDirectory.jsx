import React, { useEffect, useState } from 'react'
import api from '../services/api'

const PAGE_SIZE = 100

export default function StudentDirectory() {
  const [students, setStudents] = useState([])
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await api.get('/students', {
          params: { search: search.trim(), limit: PAGE_SIZE, offset }
        })
        if (!active) return
        const data = response.data.data
        setStudents(data.students || [])
        setTotalCount(data.totalCount || 0)
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || requestError.message)
      } finally {
        if (active) setLoading(false)
      }
    }, 250)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [search, offset, refreshKey])

  function updateSearch(value) {
    setSearch(value)
    setOffset(0)
  }

  return (
    <main className="container workspace">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin tools</p>
          <h1>Student directory</h1>
          <p className="lede">Search students by name, student ID, class, or email.</p>
        </div>
      </div>
      <section className="admin-section student-directory">
        <div className="directory-heading">
          <div>
            <h2>Students ({totalCount})</h2>
            <p className="section-note">Search results include each student's current wallet status.</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => setRefreshKey(current => current + 1)}>Refresh list</button>
        </div>
        <div className="field directory-search">
          <label htmlFor="studentDirectorySearch">Search students</label>
          <input
            id="studentDirectorySearch"
            type="search"
            value={search}
            onChange={event => updateSearch(event.target.value)}
            placeholder="Name, student ID, class, or email"
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="student-table-wrap">
          <table className="student-table">
            <thead>
              <tr><th>Student ID</th><th>Name</th><th>Class</th><th>Email</th><th>Wallet</th><th>Status</th></tr>
            </thead>
            <tbody>
              {students.map(student => (
                <tr key={student.id}>
                  <td><strong>{student.student_id}</strong></td>
                  <td>{student.first_name} {student.last_name}</td>
                  <td>{student.class || '-'}</td>
                  <td>{student.email}</td>
                  <td>GHS {Number(student.balance || 0).toFixed(2)}</td>
                  <td>{student.status}</td>
                </tr>
              ))}
              {!loading && !error && !students.length && (
                <tr><td colSpan="6">{search ? 'No students match this search.' : 'No students onboarded yet.'}</td></tr>
              )}
              {loading && <tr><td colSpan="6">Loading students...</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="directory-pagination">
          <span>{totalCount ? `Showing ${offset + 1}-${Math.min(offset + students.length, totalCount)} of ${totalCount}` : 'No students found'}</span>
          <div>
            <button className="secondary-button" type="button" onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))} disabled={loading || offset === 0}>Previous</button>
            <button className="secondary-button" type="button" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={loading || offset + students.length >= totalCount}>Next</button>
          </div>
        </div>
      </section>
    </main>
  )
}
