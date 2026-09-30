export interface Member {
  first_names: string;
  last_names: string;
  code: string;
  id: string;
}

export interface PersonName {
  first_names: string;
  last_names: string;
}

export interface Cover {
  course: string;
  week: string;
  title: string;
  subtitle: string;
  teacher: PersonName;
  city: string;
  year: string;
  faculty: string;
  members: Member[];
  show_codes: boolean;
}

export interface StoredMember {
  name: string;
  code: string;
}

export type StoredCover = Omit<Cover, 'members' | 'teacher'> & {
  teacher: string;
  members: StoredMember[];
};
export type CoverFileFormat = 'pdf' | 'docx';
export type PreviewStatus = 'loading' | 'ready' | 'error';
export interface HistoryEntry {
  id: string;
  title: string;
  course: string;
  created_at: string;
}

export interface SavedCover extends HistoryEntry {
  data: StoredCover;
  owned?: boolean;
}

export interface HistoryPage {
  items: HistoryEntry[];
  total: number;
}
