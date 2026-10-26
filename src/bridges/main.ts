import '@fontsource-variable/inter';
import '../ui/theme.css';
import '../ui/shell.css';
import './bridges.css';
import { mountBridges } from './app';

mountBridges(document.getElementById('app')!);
