import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './queens.css';
import { mountQueens } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('queens');
mountQueens(document.getElementById('app')!);
