export interface Place {
  name: string;
  coords: [number, number];
  fragment: string;
  verse: string;
  description: string;
  image?: string;
}

export interface WordDefinition {
  word: string;
  origin: string;
  definition: string;
  image?: string;
}

export type PlaceTiming = [timestamp: number, placeKey: string, stanzaNumber: number];

export interface PlaceImageUrls {
  [key: string]: string;
}

export interface WordImageUrls {
  [key: string]: string;
}

export type SheetType = 'place' | 'word' | 'info' | null;

export type SheetData = {
  type: 'place';
  placeKey: string;
  place: Place;
} | {
  type: 'word';
  definition: WordDefinition;
} | {
  type: 'info';
} | null;
