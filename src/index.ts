// textsiegel: invisible, sentence-bound marking of AI-generated chatbot responses (EU AI Act, Art. 50(2)).
//
// - Marking: markResponse(), StreamMarker (Choice-Point-Mark + HMAC signature or public provenance)
// - Verification: verify() (internal, with keys), verifyPublic() (public, Ed25519 + record)
// - Service: createVerificationService(), directory, keys document, signed report, rate limit

export * from "./cpmark.ts";
export * from "./provenance.ts";
export * from "./service.ts";
export { encodeSignature, embedSignature, contentKey } from "./signature.ts";
export { CLASSES, type ChoiceClass, type Layer } from "./classes.ts";
