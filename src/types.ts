export type Member = { first_names: string; last_names: string; code: string; id: string };
export type Cover = { course: string; week: string; title: string; subtitle: string; teacher: string; city: string; year: string; faculty: string; members: Member[]; show_codes: boolean };
export type StoredCover = Omit<Cover, 'members'> & { members: { name: string; code: string }[] };
