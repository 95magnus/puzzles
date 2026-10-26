import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './mines.css';
import { mountMines } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('mines');
mountMines(document.getElementById('app')!);
