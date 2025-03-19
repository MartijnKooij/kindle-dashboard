import { existsSync, rmdirSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define paths
const distPath = join(__dirname, 'dist');
const zipFilePath = join(__dirname, 'kindle-dashboard-image.zip');

// Check and remove dist directory if it exists
if (existsSync(distPath)) {
  rmdirSync(distPath, { recursive: true });
  console.log('dist directory removed');
} else {
  console.log('dist directory does not exist');
}

// Check and remove zip file if it exists
if (existsSync(zipFilePath)) {
  unlinkSync(zipFilePath);
  console.log('zip file removed');
} else {
  console.log('zip file does not exist');
}
