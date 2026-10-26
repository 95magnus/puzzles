import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './balanced.css';
import { mountBalanced } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('balanced');
mountBalanced(document.getElementById('app')!);
