import { documentHash } from "./security";
import { digits, validDocument } from "./validation";

export function customerDocumentHashes(document: string) {
  const number = digits(document);
  if (!/^[\d./-]+$/.test(document) || number.length < 8 || number.length > 14)
    return [];
  const candidates = [number.padStart(14, "0")];
  if (number.length <= 11) candidates.push(number.padStart(11, "0"));
  return candidates.filter(validDocument).map(documentHash);
}
