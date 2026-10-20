import '@fontsource-variable/inter';
import '../ui/theme.css';
import './mines.css';
import { mulberry32, randomSeed } from '../core/rng';
import { createBoard } from './board';
import { chord, newGame, reveal, toggleFlag } from './game';
import { PRESETS, generateBoard } from './generate';

// Temporary until the app shell lands: a playable practice board.
const root = document.getElementById('app')!;
root.classList.add('mines-board');
const game = newGame(generateBoard(PRESETS.expert, mulberry32(randomSeed())));
const board = createBoard(root, {
  onAction(a) {
    const fn = a.kind === 'flag' ? toggleFlag : a.kind === 'chord' ? chord : reveal;
    board.update(fn(game, a.cell), a.kind === 'flag' ? undefined : a.cell);
  },
});
board.setGame(game);
