export interface RadicalEntry {
  radical: string;
  strokeCount: number;
  notes?: string;
}

export interface ReferenceEntry extends RadicalEntry {
  variants: string[];
}

export interface RadicalsData {
  source: string;
  main: RadicalEntry[];
  variant: RadicalEntry[];
  reference: ReferenceEntry[];
}

declare const radicals: RadicalsData;

export default radicals;
