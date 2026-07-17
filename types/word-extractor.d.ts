// Minimal type declaration for word-extractor (ships no types of its own).
declare module "word-extractor" {
  interface WordDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
    getEndnotes(): string;
    getAnnotations(): string;
  }
  class WordExtractor {
    extract(input: Buffer | string): Promise<WordDocument>;
  }
  export default WordExtractor;
}
