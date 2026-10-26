import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './bridges.css';
import { mountBridges } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('bridges');
mountBridges(document.getElementById('app')!);
