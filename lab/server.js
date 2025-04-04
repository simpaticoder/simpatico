import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Function to read a local file
function readDependencyFile(filePath) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const absolutePath = resolve(__dirname, filePath);
    const data = readFileSync(absolutePath, 'utf-8');
    console.log(`Contents of dependency file (${filePath}):\n${data}`);
}

function readLocalFile(filePath) {
    const __dirname = process.cwd();
    const absolutePath = resolve(__dirname, filePath);
    const data = readFileSync(absolutePath, 'utf-8');
    console.log(`Contents of local file (${filePath}):\n${data}`);
}

function main() {
    const localFile = process.argv[2];
    const dependencyFile = process.argv[3];


    if (localFile) {
        readLocalFile(localFile);
    }

    if (dependencyFile) {
        readDependencyFile(dependencyFile);
    }
}


main();
