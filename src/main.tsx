import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

// StrictMode is intentionally omitted: it double-mounts effects in development,
// which would tear down the microphone and voice socket immediately after the
// session starts listening.
createRoot(document.getElementById('root')!).render(<App />)
