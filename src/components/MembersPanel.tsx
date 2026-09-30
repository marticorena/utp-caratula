import { useRef, useState } from 'react';
import {
  ArrowDownAZ,
  GripVertical,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { compareMembersBySurname, createMember } from '../cover';
import { Field } from './Field';
import type { Member } from '../types';

interface DragState {
  id: string;
  target: string;
}

export interface MembersPanelProps {
  members: Member[];
  hidden: boolean;
  onChange: (members: Member[]) => void;
  onNotice: (message: string) => void;
}

/** Render and manage the student list, including accessible reordering. */
export function MembersPanel({
  members,
  hidden,
  onChange,
  onNotice,
}: MembersPanelProps) {
  const drag = useRef<DragState | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  function updateMember(id: string, changes: Partial<Member>) {
    onChange(members.map((member) => (
      member.id === id ? { ...member, ...changes } : member
    )));
  }

  function reorderMember(id: string, target: string): boolean {
    const from = members.findIndex((member) => member.id === id);
    const to = members.findIndex((member) => member.id === target);
    if (from < 0 || to < 0 || from === to) return false;

    const reordered = [...members];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    onChange(reordered);
    return true;
  }

  function beginDrag(id: string) {
    drag.current = { id, target: id };
    setDraggingId(id);
    setTargetId(id);
  }

  function finishDrag(commit: boolean) {
    const current = drag.current;
    if (commit && current && reorderMember(current.id, current.target)) {
      onNotice('Orden de integrantes actualizado.');
    }
    drag.current = null;
    setDraggingId(null);
    setTargetId(null);
  }

  function moveWithKeyboard(member: Member, index: number, key: string) {
    if (key === 'Escape') {
      finishDrag(false);
      return;
    }
    if (key !== 'ArrowUp' && key !== 'ArrowDown') return;

    const targetIndex = key === 'ArrowUp' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= members.length) return;
    if (reorderMember(member.id, members[targetIndex].id)) {
      onNotice(`Integrante movido a la posición ${targetIndex + 1}.`);
    }
  }

  return (
    <section
      className="form-section tab-panel"
      role="tabpanel"
      id="editor-panel-1"
      aria-labelledby="editor-tab-1"
      hidden={hidden}
    >
      <div className="member-tools">
        <button
          type="button"
          className="sort-members"
          disabled={members.length < 2}
          onClick={() => {
            onChange([...members].sort(compareMembersBySurname));
            onNotice('Integrantes ordenados alfabéticamente por apellido.');
          }}
        >
          <ArrowDownAZ size={16} />
          Por apellido
        </button>
      </div>

      <div className="members-list">
        {members.map((member, index) => (
          <article
            className={memberCardClass(member.id, draggingId, targetId)}
            data-member-id={member.id}
            key={member.id}
            onDragEnter={(event) => {
              if (!drag.current) return;
              event.preventDefault();
              drag.current.target = member.id;
              setTargetId(member.id);
            }}
            onDragOver={(event) => {
              if (drag.current) event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              finishDrag(true);
            }}
          >
            <div className="member-heading">
              <button
                type="button"
                draggable={members.length > 1}
                className="icon-button member-grip"
                aria-label={
                  `Reordenar integrante ${index + 1}: `
                  + 'arrastra o usa las flechas arriba y abajo'
                }
                title="Arrastra para reordenar; también puedes usar ↑ y ↓"
                onDragStart={(event) => {
                  beginDrag(member.id);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', member.id);
                }}
                onDragEnd={() => finishDrag(false)}
                onPointerDown={(event) => {
                  if (event.button !== 0 || members.length < 2) return;
                  if (event.pointerType === 'mouse') return;
                  event.preventDefault();
                  event.currentTarget.focus();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  beginDrag(member.id);
                }}
                onPointerMove={(event) => {
                  if (!drag.current) return;
                  updatePointerTarget(event.clientX, event.clientY, drag.current);
                  setTargetId(drag.current.target);
                }}
                onPointerUp={() => finishDrag(true)}
                onPointerCancel={() => finishDrag(false)}
                onLostPointerCapture={() => finishDrag(false)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                    event.preventDefault();
                  }
                  moveWithKeyboard(member, index, event.key);
                }}
              >
                <GripVertical size={18} />
              </button>
              <span>
                <Users size={14} /> Integrante {index + 1}
              </span>
              <button
                className="icon-button delete"
                onClick={() => onChange(
                  members.filter((item) => item.id !== member.id),
                )}
                aria-label={`Eliminar integrante ${index + 1}`}
                title="Eliminar integrante"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="member-name-fields">
              <Field
                label="Nombres"
                value={member.first_names}
                onChange={(value) => updateMember(member.id, { first_names: value })}
                placeholder="Nombres"
                maxLength={120}
              />
              <Field
                label="Apellidos"
                value={member.last_names}
                onChange={(value) => updateMember(member.id, { last_names: value })}
                placeholder="Apellidos"
                maxLength={120}
              />
            </div>
            <Field
              label="Código (opcional)"
              value={member.code}
              onChange={(value) => updateMember(member.id, { code: value })}
              placeholder="Código de estudiante"
              maxLength={30}
            />
          </article>
        ))}
      </div>

      {!members.length && (
        <p className="empty-members">
          Tu carátula no tendrá una sección de estudiantes.
        </p>
      )}
      <button
        className="add-member"
        disabled={members.length >= 30}
        onClick={() => onChange([...members, createMember()])}
      >
        <Plus size={17} />
        {members.length >= 30
          ? 'Límite de 30 integrantes'
          : 'Agregar integrante'}
      </button>
    </section>
  );
}

function memberCardClass(
  id: string,
  draggingId: string | null,
  targetId: string | null,
): string {
  return [
    'member-card',
    draggingId === id ? 'member-dragging' : '',
    targetId === id && draggingId !== id ? 'member-drop-target' : '',
  ].filter(Boolean).join(' ');
}

function updatePointerTarget(x: number, y: number, drag: DragState) {
  const card = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>('[data-member-id]');
  if (card?.dataset.memberId) drag.target = card.dataset.memberId;

  if (y < 65) window.scrollBy(0, -18);
  else if (y > window.innerHeight - 65) window.scrollBy(0, 18);
}
