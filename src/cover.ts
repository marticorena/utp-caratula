import defaults from './defaults.json';
import type { Cover, Member, PersonName, StoredCover } from './types';

/** Create an empty member with a stable UI identity. */
export const createMember = (): Member => ({
  first_names: '',
  last_names: '',
  code: '',
  id: crypto.randomUUID(),
});

/** Convert a persisted display name into editable name fields. */
export function personFromStored(name: string): PersonName {
  const comma = name.indexOf(',');
  if (comma >= 0) {
    return {
      last_names: name.slice(0, comma).trim(),
      first_names: name.slice(comma + 1).trim(),
    };
  }

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return { first_names: words[0] || '', last_names: '' };
  }
  const surnameWords = words.length >= 3 ? 2 : 1;
  return {
    first_names: words.slice(0, -surnameWords).join(' '),
    last_names: words.slice(-surnameWords).join(' '),
  };
}

/** Convert a persisted student into the UI representation. */
export function memberFromStored(
  stored: { name: string; code: string },
): Member {
  return {
    ...personFromStored(stored.name),
    code: stored.code,
    id: crypto.randomUUID(),
  };
}

/** Format an editable name using the cover's surname-first convention. */
export function formatPersonName(person: PersonName): string {
  return [person.last_names.trim(), person.first_names.trim()]
    .filter(Boolean)
    .join(', ');
}

/** Create the example cover shown on first use. */
export function createInitialCover(): Cover {
  return {
    ...defaults,
    teacher: personFromStored(defaults.teacher),
    show_codes: true,
    year: String(new Date().getFullYear()),
    members: defaults.members.map(memberFromStored),
  };
}

/** Create a cover with every optional field empty. */
export function createEmptyCover(): Cover {
  return {
    course: '',
    week: '',
    title: '',
    subtitle: '',
    teacher: { first_names: '', last_names: '' },
    city: '',
    year: '',
    faculty: '',
    members: [],
    show_codes: true,
  };
}

/** Convert UI-only structures to the API contract. */
export function toStoredCover(data: Cover): StoredCover {
  return {
    ...data,
    teacher: formatPersonName(data.teacher),
    show_codes: true,
    members: data.members.map((item) => ({
      name: formatPersonName(item),
      code: item.code,
    })),
  };
}

/** Convert API data into editable UI state. */
export function coverFromStored(saved: StoredCover): Cover {
  return {
    course: saved.course,
    week: saved.week,
    title: saved.title,
    subtitle: saved.subtitle,
    teacher: personFromStored(saved.teacher),
    city: saved.city,
    year: saved.year,
    faculty: saved.faculty,
    show_codes: true,
    members: saved.members.map(memberFromStored),
  };
}

/** Compare students by surname and then given names using Spanish collation. */
export function compareMembersBySurname(a: Member, b: Member): number {
  const options = { sensitivity: 'base', numeric: true } as const;
  return a.last_names.localeCompare(b.last_names, 'es', options)
    || a.first_names.localeCompare(b.first_names, 'es', options);
}
