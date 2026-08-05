# `generated/`

Output directory for `npm run create-client`. Everything under here except
this file is gitignored — a generated client project is never committed to
this repository.

Why: this repo is the factory (the generator, the template, the tests), not
a place to accumulate a full copy of every barbershop it produces. Each
generated project becomes its **own independent Git repository** — see
[`docs/OPERATOR_GUIDE.md`](../docs/OPERATOR_GUIDE.md) §12 for the exact
steps ("Repositorio: un proyecto generado por cliente, nunca todos en el
mismo repo").

The only client-shaped fixture kept in this repo is
[`clients/reemplazar-slug.yaml`](../clients/reemplazar-slug.yaml) — a
placeholder-only configuration (every field either generic or
`REEMPLAZAR_*`), used as the fill-in-the-blanks starting point for a new
client and as a fixture in `tests/factory/create-client.test.ts`. It is
never generated into a committed project directory here.
