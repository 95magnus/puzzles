import '@fontsource-variable/inter';
import '../../ui/theme.css';
import '../../ui/shell.css';
import './sums.css';
import { mountSums } from './app';
import { trackErrors } from '../../core/analytics';

trackErrors('sums');
mountSums(document.getElementById('app')!);
