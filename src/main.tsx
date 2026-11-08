import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { EntryExperience } from './app/EntryExperience';
import './styles.css';
import './purple-gold.css';
import './arcade-fonts.css';
import './v5.css';
import './space.css';
import './pixel-panels.css';
import './typography.css';
import './achievements.css';
import './score-columns.css';
import './animal-avatars.css';
import './live-league.css';
import './make-a-move.css';

import { SpacetimeRoot } from './app/spacetime';

// Nessie supplies bank data; SpacetimeDB stores player state and the live
// league. The app falls back to browser storage if the server is unreachable.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeRoot>
      <EntryExperience />
    </SpacetimeRoot>
  </StrictMode>
);
