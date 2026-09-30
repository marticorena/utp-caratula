import { FolderOpen, LoaderCircle, Plus } from 'lucide-react';

export interface AppHeaderProps {
  creating: boolean;
  onCreate: () => void;
  onOpenHistory: () => void;
}

/** Render the application identity and primary navigation actions. */
export function AppHeader({
  creating,
  onCreate,
  onOpenHistory,
}: AppHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand-group">
        <a href="#" className="wordmark" aria-label="UTP Carátula, inicio">
          <span className="brand-utp">UTP</span> Carátula
        </a>
      </div>
      <div className="top-actions">
        <button
          className="history-button"
          disabled={creating}
          onClick={onCreate}
        >
          {creating
            ? <LoaderCircle className="spin" size={17} />
            : <Plus size={17} />}
          Nueva carátula
        </button>
        <button className="history-button" onClick={onOpenHistory}>
          <FolderOpen size={17} />
          Mis carátulas
        </button>
      </div>
    </header>
  );
}
