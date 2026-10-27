import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './loop.css';
import { mountLoop } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('loop');
mountLoop(document.getElementById('app')!);
