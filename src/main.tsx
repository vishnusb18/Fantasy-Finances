import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './styles.css';

// MVP (option A): the app runs entirely in the browser. The SpacetimeDB
// connection from the template is intentionally not mounted yet; the generated
// bindings in ./module_bindings are kept for the later multiplayer phase.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
