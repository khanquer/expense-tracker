import { useState } from 'react'
import { matchPath, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router'
import { Home } from './screens/Home'
import { History } from './screens/History'
import { Add } from './screens/Add'
import { EditExpense } from './screens/EditExpense'
import { Prices } from './screens/Prices'
import { ProductDetail } from './screens/ProductDetail'
import { Settings } from './screens/Settings'
import { Icon, type IconName } from './components/Icon'
import { AddOptions } from './components/AddOptions'
import { haptic, Sheet, Toaster } from './components/ui'
import { putFiles } from './lib/inbox'

const TABS: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/prices', label: 'Prices', icon: 'prices' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function App() {
  const location = useLocation()
  const [sheetOpen, setSheetOpen] = useState(false)
  // Detail and add screens are "pushed" over the tabs, like native apps: no bottom bar.
  const isTab = TABS.some((t) => matchPath({ path: t.to, end: true }, location.pathname))
  const showFab = isTab && location.pathname !== '/settings'

  return (
    <div className={`app ${isTab ? 'has-nav' : ''}`}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/history" element={<History />} />
        <Route path="/add" element={<Add />} />
        <Route path="/expense/:id" element={<EditExpense />} />
        <Route path="/prices" element={<Prices />} />
        <Route path="/prices/:id" element={<ProductDetail />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>

      {showFab && (
        <button
          className="fab"
          aria-label="Add expense"
          onClick={() => {
            haptic()
            setSheetOpen(true)
          }}
        >
          <Icon name="plus" size={28} />
        </button>
      )}

      {isTab && (
        <nav className="navbar">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end className="navbar-item" replace>
              <span className="navbar-pill">
                <Icon name={t.icon} />
              </span>
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}

      <AddSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <Toaster />
    </div>
  )
}

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  return (
    <Sheet open={open} onClose={onClose} title="Add an expense">
      <div className="sheet-list">
        <AddOptions
          onFiles={(files) => {
            onClose()
            putFiles(files)
            navigate('/add?mode=images')
          }}
          onMode={(mode) => {
            onClose()
            navigate(`/add?mode=${mode}`)
          }}
        />
      </div>
    </Sheet>
  )
}
