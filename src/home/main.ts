import '@fontsource-variable/inter';
import '../ui/theme.css';
import '../ui/shell.css';
import './home.css';
import { mountHome } from './home';
import { trackErrors } from '../core/analytics';

trackErrors('home');
mountHome(document.getElementById('app')!);
