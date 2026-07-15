import { useEffect, useRef, useState } from 'react'
import { signInWithGoogle, signOutUser, subscribe, syncEnabled } from './sync'

// Header account control: "Sign in" when signed out, avatar + menu when signed
// in. Hidden entirely if Firebase isn't configured (BloodFang runs local-only).
export default function AccountButton() {
  const [user, setUser] = useState(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => subscribe(setUser), [])

  // Close the menu on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onEsc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  if (!syncEnabled) return null // not configured → no account UI

  const signIn = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch {
      /* popup closed / blocked — no-op */
    } finally {
      setBusy(false)
    }
  }

  const signOut = async () => {
    setOpen(false)
    await signOutUser()
  }

  if (!user) {
    return (
      <button className="account-btn" data-no-loader onClick={signIn} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    )
  }

  const name = user.displayName || user.email || 'Account'
  const initial = (name[0] || '?').toUpperCase()

  return (
    <div className="account" data-no-loader ref={ref}>
      <button
        className="avatar-btn"
        title={name}
        aria-label="Account"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {user.photoURL ? (
          <img src={user.photoURL} alt={name} referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar-fallback">{initial}</span>
        )}
      </button>
      {open && (
        <div className="account-menu" role="dialog" aria-label="Account">
          <p className="account-name">{name}</p>
          <p className="account-sync">☁ Synced across your devices</p>
          <button className="btn" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
