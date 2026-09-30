import { useRef } from 'react';
import type { KeyboardEvent } from 'react';

const TAB_LABELS = ['Sobre tu trabajo', 'Integrantes'] as const;

export interface EditorTabsProps {
  activeTab: number;
  memberCount: number;
  onChange: (tab: number) => void;
}

/** Render the accessible keyboard-navigable editor tabs. */
export function EditorTabs({
  activeTab,
  memberCount,
  onChange,
}: EditorTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: KeyboardEvent, index: number) {
    const next = nextTab(event.key, index);
    if (next === null) return;
    event.preventDefault();
    onChange(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="editor-tabs" role="tablist" aria-label="Secciones del formulario">
      {TAB_LABELS.map((label, index) => (
        <button
          key={label}
          ref={(element) => { tabRefs.current[index] = element; }}
          id={`editor-tab-${index}`}
          role="tab"
          aria-selected={activeTab === index}
          aria-controls={`editor-panel-${index}`}
          tabIndex={activeTab === index ? 0 : -1}
          onClick={() => onChange(index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {label}
          {index === 1 && <span className="tab-count">{memberCount}</span>}
        </button>
      ))}
    </div>
  );
}

function nextTab(key: string, current: number): number | null {
  if (key === 'ArrowRight' || key === 'ArrowLeft') return (current + 1) % 2;
  if (key === 'Home') return 0;
  if (key === 'End') return 1;
  return null;
}
