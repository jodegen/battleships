// Reine Idempotenz-Logik für Zug-Events (FR-017, SC-008). Eine bereits verarbeitete
// `moveId` darf nie ein zweites Mal wirken. Die Mengenführung ist hier rein; die atomare
// Anwendung gegen Redis erfolgt im GameService.

export function isProcessed(processed: ReadonlyArray<string>, moveId: string): boolean {
  return processed.includes(moveId);
}

/** Fügt eine `moveId` hinzu (idempotent — kein Duplikat in der Liste). */
export function withProcessed(processed: ReadonlyArray<string>, moveId: string): string[] {
  return isProcessed(processed, moveId) ? [...processed] : [...processed, moveId];
}
