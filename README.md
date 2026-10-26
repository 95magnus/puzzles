# Puzzles

Daily logic puzzles in the browser. Every puzzle has one daily board, the same for everyone and reset at UTC midnight, plus a practice mode for unlimited extra boards.

Play at **[puzzles.solhaug.dev](https://puzzles.solhaug.dev)**.

## The puzzles

| Puzzle | Goal |
| --- | --- |
| **Flow** | Drag from each dot to its match so the paths fill every cell. |
| **Mines** | Reveal every safe tile; numbers count the mines around them. |
| **Tangle** | Slide every arrow off the board without bumping another. You have 3 lives. |
| **Queens** | Place one queen in every row, column and colour region; queens can't touch. |
| **Patches** | Split the grid into rectangles, each holding one clue for its shape and size. |
| **Balanced** | Fill the grid with ● and ○: equal counts per line, no three in a row, and `=` / `×` hints between cells. |
| **Bridges** | Connect the islands with straight, non-crossing bridges so each matches its number and all join up. |

Each game has a **?** button with the full rules and an animated demo. Progress and stats are saved in the browser's `localStorage`.

## Development

Needs Node 24 (what CI uses).

```bash
npm install
```

```bash
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build every page into `dist/` |
| `npm test` | Unit tests (Vitest) |
| `npm run e2e` | End-to-end tests (Playwright) |
| `npm run test:slow` | The slower Flow generator tests |

## Project layout

```
index.html, <game>.html   one page per puzzle plus the dashboard
src/pages.ts              list of pages Vite builds and the dashboard links to
src/core/                 daily seed, RNG, storage, analytics
src/ui/                   shared shell: header, modals, grid fitting, theme
src/home/                 the dashboard
src/games/<game>/         each puzzle: generator, solver, game state, board, how-to
tests/                    unit tests mirroring src/, plus tests/e2e for Playwright
docs/superpowers/         design specs and implementation plans per puzzle
```

Puzzles are generated in the client from a seed derived from the date, so there is no backend. A new puzzle starts with an entry in `src/pages.ts` and a page at the project root.

## Deployment

Pushes to `main` run the tests, build, and deploy `dist/` to GitHub Pages ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)). Page views and play events go to Umami on the deployed domain only.

## License

[MIT](LICENSE)
