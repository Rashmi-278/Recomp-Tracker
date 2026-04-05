import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { PrivyProvider } from '@privy-io/react-auth'
import RecompTracker from './RecompTracker'
import PublicProfile from './PublicProfile'

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID || ''

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#ff6b9d',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RecompTracker />} />
          <Route path="/:username" element={<PublicProfile />} />
        </Routes>
      </BrowserRouter>
    </PrivyProvider>
  </React.StrictMode>,
)
