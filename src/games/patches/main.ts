import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './patches.css';
import { mountPatches } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('patches');
mountPatches(document.getElementById('app')!);
