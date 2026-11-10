import React, { useContext } from 'react'
import { Link } from 'react-router-dom'
import { AuthContext } from '../context/AuthContext'
import schoolLogo from '../public/cropped-transparent-logo-1.png'
import isSuperAdminUser from '../utils/isSuperAdmin'

export default function Header(){
  const { user, logout } = useContext(AuthContext)
  const isSuperAdmin = isSuperAdminUser(user)
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link className="brand" to={isSuperAdmin ? '/admin' : user?.role === 'vendor' ? '/vendor' : '/dashboard'}>
          <img className="brand-logo" src={schoolLogo} alt="McCarthy Hill School logo" />
          <span>McCarthy Hill Coupon System</span>
        </Link>
        <nav className="main-nav">
          {user ? (
            <>
              {isSuperAdmin && <Link to="/admin">Admin portal</Link>}
              {user.role === 'vendor' ? <><Link to="/vendor">Overview</Link><Link to="/purchase">New sale</Link></> : <><Link to="/wallet">Wallets</Link><Link to="/topup">Top up</Link><Link to="/transactions">Transactions</Link></>}
              <span className="user-chip">{user.username || user.email}</span>
              <button className="logout-button" onClick={logout}>Sign out</button>
            </>
          ) : (
            <>
              <Link to="/">Login</Link>
              <Link to="/register" style={{marginLeft:12}}>Register</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
