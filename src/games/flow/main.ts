import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './flow.css';
import { mountFlow } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('flow');
mountFlow(document.getElementById('app')!);
