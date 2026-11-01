# textsiegel glossary

Binding terms for code, tests, tickets and docs. The code name is given where it differs from the term. Use the term, not the listed synonyms.

## Marking

**Marker**:
A run of carrier characters behind a sentence end that encodes one payload. Generic term for signature and provenance marker.
_Avoid_: watermark (reserved for the whole method), tag, stamp

**Carrier**:
One of the three invisible characters that encode base-3 digits: ZWNJ (U+200C) = 0, ZWJ (U+200D) = 1, Word Joiner (U+2060) = 2. See [ADR-0002](docs/adr/0002-carriers-zwnj-zwj-wj.md).
_Code_: `DIGITS`
_Avoid_: zero-width character (too broad), variation selector (rejected carrier)

**Run**:
A sequence of 8 or more carriers. A run of 101 carriers is a signature, of 81 a provenance marker; other lengths are remnants.
_Code_: `SIGNATURE_RE`, `fromRun`

**Version byte**:
The first payload byte; it fixes the meaning of the rest. `0xF2` = signature, `0xF3` = provenance marker. Never reused with another meaning.

**Signature** (0xF2):
HMAC-signed marker: version · customer ID (4) · response ID (6) · content tag (3) · HMAC (6) = 20 bytes, 101 carriers. Verifiable only with the mark key.
_Code_: `encodeSignature`, `verifySignature`
_Avoid_: HMAC marker, internal marker

**Provenance marker** (0xF3):
Public marker: version · key ID · response ID (8) · sentence number (2) · sentence hash (4) = 16 bytes, 81 carriers. Points to a record.
_Code_: `createProvenance`, `verifyPublic`

**Record**:
Ed25519-signed canonical JSON per response with key ID, response ID, customer pseudonym, creation time, salt, optional model and the sentence hashes. Contains no text.
_Code_: `SignedRecord`

**Directory**:
Storage of records, served at `/v1/records/{responseId}`.
_Code_: `memoryDirectory`, `fileDirectory`

**Content key**:
The normalized sentence content that content tag and sentence hash cover: NFKC, leading list/heading/quote markers removed, lowercase, letters and digits only.
_Code_: `contentKey`

**Content tag**:
3-byte HMAC over customer ID, response ID and content key inside the signature; binds the signature to its sentence.
_Code_: `contentTag`
_Avoid_: content checksum (older wording in README)

**Sentence hash**:
`trunc32(SHA-256(salt ‖ content key))` inside the provenance marker and the record.

**Candidate sentence**:
A possible start of the sentence a marker belongs to, tried by the verifier: previous sentence or line end, previous marker, line start, and up to 80 word starts.
_Code_: `sentenceCandidates`

**Choice-Point-Mark**:
The statistical layer: at choice points the key selects one of several equivalent variants.
_Code_: `markText`, `detect`; module `cpmark`

**Choice point**:
A place in German text where a class offers equivalent variants ("zudem/außerdem", no-break space before units …).

**Class**:
A set of equivalent variants with a stable ID (`furthermore`, `approximately`, `percent` …). Belongs to a layer.
_Code_: `ChoiceClass`, `CLASSES`

**Layer**:
Group of classes evaluated together: `lexical` (words) or `typography` (spaces, dashes, quotes).

## Keys and identities

**Mark key**:
The HMAC secret of a deployment; used for signature and Choice-Point-Mark. One per deployment ([ADR-0005](docs/adr/0005-one-mark-key-per-deployment.md)).
_Code_: `MARK_KEY`, option `key`
_Avoid_: customer key, API key

**Customer ID**:
32-bit tenant number in the signature. Identifies the chatbot customer of the deployment, not the end user.

**Response ID**:
Random ID of one chatbot response; 6 bytes in a signature, 8 bytes in a provenance marker.

**Key ID**:
Number of the Ed25519 key that signed a record or report.

## Verification

**Verdict** (internal, with mark key):
`signed` (valid signature whose content tag matches at least one sentence), `signed-altered` (valid signature, no matching sentence), `statistical` (no signature, Choice-Point-Mark significant), `none`.
_Code_: `Verdict`

**Public verdict** (provenance):
`verified`, `altered`, `unverified`, `none`. Per sentence: `origin` (record, signature and hash found) and `unchanged` (sentence matches its hash).
_Code_: `PublicVerdict`

**Verification service**:
The HTTP service in `server/` with check page, about page, signpost and `POST /v1/verify`.
_Avoid_: Prüfdienst, checker

**Check page**:
The public web page for verification (`/check`, GitHub Pages).

**Report**:
Ed25519-signed result of one verification with SHA-256 of the text, service identifier, timestamp and result.
_Code_: `VerificationReport`, `SignedReport`

**Expert**:
A user with an expert token (authorities, press, research); gets unlimited checks and the statistical result.
_Code_: `EXPERT_TOKENS`, option `expert`

**Signpost**:
`/.well-known/textsiegel.json`: machine-readable description of marker format, API and keys (Code of Practice 3.4).

**Test page**:
Development page that renders answers like a chat widget and runs copy-paste and diagnostic tests. Off in production (`TEST_PAGE=0`).
