import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './tangle.css';
import { mountTangle } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('tangle');
mountTangle(document.getElementById('app')!);
