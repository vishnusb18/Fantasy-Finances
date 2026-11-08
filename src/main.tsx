import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryExperience } from './app/EntryExperience';
import './styles.css';
import './purple-gold.css';
import './inter.css';
import './arcade-fonts.css';
import './v5.css';
import './space.css';
import './typography.css';

// MVP (option A): the app runs entirely in the browser. The SpacetimeDB
// connection from the template is intentionally not mounted yet; the generated
// bindings in ./module_bindings are kept for the later multiplayer phase.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EntryExperience />
  </StrictMode>
);
