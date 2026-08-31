const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'dist');
const files = ['index.html', 'control.html', 'display.html'];
const directories = ['assets', 'src', 'templates'];

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
for (const file of files) fs.copyFileSync(path.join(projectRoot, file), path.join(outputDir, file));
for (const directory of directories) {
  fs.cpSync(path.join(projectRoot, directory), path.join(outputDir, directory), { recursive: true });
}
console.log('Static site built in dist/');
