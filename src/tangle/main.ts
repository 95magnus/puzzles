import '@fontsource-variable/inter';
import '../ui/theme.css';
import '../ui/shell.css';
import './tangle.css';
import { mountTangle } from './app';

mountTangle(document.getElementById('app')!);
