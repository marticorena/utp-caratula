import { Field } from './Field';
import type { Cover } from '../types';

const CITIES = [
  'Lima',
  'Arequipa',
  'Chiclayo',
  'Piura',
  'Trujillo',
  'Huancayo',
  'Ica',
  'Chimbote',
] as const;

export interface WorkDetailsPanelProps {
  cover: Cover;
  hidden: boolean;
  onChange: <Key extends keyof Cover>(key: Key, value: Cover[Key]) => void;
}

/** Render the academic work fields of the cover editor. */
export function WorkDetailsPanel({
  cover,
  hidden,
  onChange,
}: WorkDetailsPanelProps) {
  return (
    <section
      className="form-section tab-panel"
      role="tabpanel"
      id="editor-panel-0"
      aria-labelledby="editor-tab-0"
      hidden={hidden}
    >
      <div className="faculty-week-fields">
        <Field
          label="Facultad o carrera"
          value={cover.faculty}
          onChange={(value) => onChange('faculty', value)}
          placeholder="Nombre de la facultad o carrera"
        />
        <Field
          label="Semana"
          value={cover.week}
          onChange={(value) => onChange('week', value)}
          placeholder="1"
          maxLength={3}
          type="number"
          min={1}
          step={1}
        />
      </div>
      <Field
        label="Asignatura"
        value={cover.course}
        onChange={(value) => onChange('course', value)}
        placeholder="Nombre de la asignatura"
      />
      <Field
        label="Tema"
        value={cover.title}
        onChange={(value) => onChange('title', value)}
        placeholder="¿Cuál es el tema de tu trabajo?"
        multiline
      />
      <Field
        label="Subtema"
        value={cover.subtitle}
        onChange={(value) => onChange('subtitle', value)}
        placeholder="Una pregunta o un título complementario"
        multiline
      />
      <div className="member-name-fields">
        <Field
          label="Nombres del docente"
          value={cover.teacher.first_names}
          onChange={(value) => onChange('teacher', {
            ...cover.teacher,
            first_names: value,
          })}
          placeholder="Nombres"
          maxLength={60}
        />
        <Field
          label="Apellidos del docente"
          value={cover.teacher.last_names}
          onChange={(value) => onChange('teacher', {
            ...cover.teacher,
            last_names: value,
          })}
          placeholder="Apellidos"
          maxLength={60}
        />
      </div>
      <div className="two-fields">
        <Field
          label="Ciudad"
          value={cover.city}
          onChange={(value) => onChange('city', value)}
          placeholder="Ciudad"
          list="cities"
          maxLength={120}
        />
        <Field
          label="Año"
          value={cover.year}
          onChange={(value) => onChange('year', value)}
          placeholder="2026"
          maxLength={10}
        />
      </div>
      <datalist id="cities">
        {CITIES.map((city) => <option key={city} value={city} />)}
      </datalist>
    </section>
  );
}
