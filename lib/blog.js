#!/usr/bin/env node

import fs from 'node:fs';
import child_process from 'node:child_process';
import path from 'node:path';


const scriptDir = process.cwd();
// pnpm bug prevents locating actual invocation location. hardcode /blog for now see https://github.com/pnpm/pnpm/issues/7042
const invocationDir = scriptDir + '/blog'; // process.cwd() always reports root but we need the actual location
const relativePath =  path.relative(scriptDir, invocationDir) ?  path.relative(scriptDir, invocationDir) + '/' : '';

let debug = true;
if (debug){
    console.log({scriptDir, invocationDir, relativePath});
}

let conf = {
    authorName: 'Simpatico',
    authorLocation: 'USA',
    blogTitle: 'Simpatico Blog',
    blogDescription: 'A developer blog',
    preferredEditor: '',
    NOTE_FILE_PATTERN: "^([0-9]*)(?:-(?:.*))?\.md$",
    blogURL: `${relativePath}`,
};

// Load configuration from JSON file if it exists
const configFilePath = path.join(invocationDir, 'config.json');

try {
    if (fs.existsSync(configFilePath)) {
        const userConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
        conf = {...conf, ...userConfig}; // Merge user config with defaults
        if (debug) console.log('Loaded configuration:', conf);
    }
} catch (error) {
    console.error('Error reading or parsing config.json:', error.message);
}


// Additional derived configuration
conf = Object.assign(conf, {
    notePreamble: `# ${conf.authorName} from ${conf.authorLocation} on ${new Date().toLocaleDateString()}\n\n`,
    blogHeader: `
    # ${conf.blogTitle}
    *${conf.blogDescription}*
`,
});


const peek = (arr, fallback=null) => (arr && arr.length) ? arr[arr.length-1] : fallback;
const getMaxValue = (max=0, num) => (num > max) ? num : max;
const extractNoteNumber = (filename, notePattern) => +peek(filename.match(notePattern), 0);
const findGreatestNoteNumber = (fileNames, notePattern) => {
    if (fileNames.length === 0) {
        return 0;
    }
    return fileNames.map(nn => extractNoteNumber(nn, notePattern)).reduce(getMaxValue);
}

function getSortedFileNames() {
    const fileNames = fs.readdirSync(invocationDir).filter(name => name.endsWith('.md') || name.endsWith('.html'));
    fileNames.sort((a, b) => {
        if (a === 'index.md' || a === 'index.html') return -1;
        if (b === 'index.md' || b === 'index.html') return 1;
        return 0;
    });
    return fileNames;
}


const generateIndexFile = (fileNames) => {
    const content = fileNames.map((fileName, index) =>
        `${index + 1}. [${fileName.replace('.md', '')}](${ '/' + relativePath + fileName})`)
        .join('\n');

    fs.writeFileSync(`${invocationDir}/index.md`, conf.blogHeader + content);
    console.log(`created ${invocationDir}/index.md`);
};

// TODO add a description by looking at filecontents
// TODO add <pubDate>${timestamp}</pubDate> with file timestamp
const generateRssFile = (fileNames) => {
    const rssContent = `
      <rss version="2.0">
          <channel>
              <title>${conf.blogTitle}</title>
              <link>${conf.blogURL}</link>
              <description>${conf.blogDescription}</description>
              ${fileNames.map((fileName) => `
                <item>
                  <title>${fileName.replace('.md', '')}</title>
                  <link>${conf.blogURL +  fileName}</link>
                  <description>${fileName}</description>
                </item>`
    ).join('\n')}
          </channel>
      </rss>
  `;
    fs.writeFileSync(`${invocationDir}/rss.xml`, rssContent);
    console.log(`created ${invocationDir}/rss.xml`);
};

const generateNewPost = (fileName, content = conf.notePreamble) => {
    if (!fileName){
        const lastNoteId = findGreatestNoteNumber(getSortedFileNames(), new RegExp(conf.NOTE_FILE_PATTERN));
        fileName = (lastNoteId + 1) + '.md';
    }
    fs.writeFileSync(`${invocationDir}/${fileName}`, content);
    console.log(`created ${fileName}`);
    return fileName;
};

const handleCommands = (commands) => {
    let [fileName] = commands;
    let executed = false;

    if (commands.includes('new')) {
        fileName = generateNewPost();
        const fileNames = getSortedFileNames();
        generateIndexFile(fileNames);
        generateRssFile(fileNames);
        if (conf.preferredEditor && fileName){
            child_process.spawn(conf.preferredEditor, [fileName]);
        }
        executed = true;
    }
    if (commands.includes('index')) {
        generateIndexFile(getSortedFileNames());
        executed = true;
    }
    if (commands.includes('rss')) {
        generateRssFile(getSortedFileNames());
        executed = true;
    }
    if (commands.includes('edit')) {
        if (conf.preferredEditor && fileName){
            // See https://www.jetbrains.com/help/idea/working-with-the-ide-features-from-command-line.html for how to get 'idea' working as an editor
            child_process.spawn(conf.preferredEditor, [fileName]);
        }
        executed = true;
    }
    if (!executed) {
        console.log('Please provide at least one command: new, index, rss, edit');
    }
};

const args = process.argv.slice(2);
handleCommands(args);



