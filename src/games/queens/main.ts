import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './queens.css';
import { mountQueens } from './app';

mountQueens(document.getElementById('app')!);
