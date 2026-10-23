import '@fontsource-variable/inter';
import '../ui/theme.css';
import '../ui/shell.css';
import './patches.css';
import { mountPatches } from './app';

mountPatches(document.getElementById('app')!);
