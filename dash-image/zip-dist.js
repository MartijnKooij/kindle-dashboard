import { execSync } from 'child_process';

execSync('7z a -r -tzip ../kindle-dashboard-image *', {
  cwd: 'dist',
  timeout: 15000
});
