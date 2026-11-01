# Independent project, English, MIT

Decision by Daniel (2026-10-31: "ich würde den Kern Fragbar-unabhängig haben wollen …", name "textsiegel", "mach einfach alles in Englisch", MIT), implemented in the initial commits of github.com/kokosnuss7777/textsiegel (no PR).

textsiegel is a public repository under the MIT license. The core library knows nothing about Fragbar; anyone can use it and run their own verification service. Code, comments, docs, UI, commit messages and PR texts are English.

## Considered Options

- **Module inside Fragbar:** others could not use it, and Fragbar's backend language is still open. Rejected.
- **German docs first:** the target audience includes non-German providers and ports. Rejected.
- **Copyleft license:** would deter commercial chatbot providers, who are the main users. Rejected.

## Consequences

- Exceptions to "English": the German sample texts and the German Choice-Point-Mark classes.
- Ports to other languages are possible via `spec/test-vectors.json`.
