export type Member = { first_names: string; last_names: string; code: string; id: string };
export type PersonName = { first_names: string; last_names: string };
export type Cover = { course: string; week: string; title: string; subtitle: string; teacher: PersonName; city: string; year: string; faculty: string; members: Member[]; show_codes: boolean };
export type StoredCover = Omit<Cover, 'members' | 'teacher'> & { teacher: string; members: { name: string; code: string }[] };
export type CoverFileFormat = 'pdf' | 'docx';
export type HistoryEntry = { id: string; title: string; course: string; created_at: string };
export type SavedCover = HistoryEntry & { data: StoredCover; owned?: boolean };
export type HistoryPage = { items: HistoryEntry[]; total: number };
