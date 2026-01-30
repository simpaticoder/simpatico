#!/usr/bin/env node

import fs from 'node:fs';
import child_process from 'node:child_process';
import path from 'node:path';


const scriptDir = process.cwd();
// pnpm runs scripts from package root, so use INIT_CWD to get actual invocation directory
const invocationDir = process.env.INIT_CWD || process.cwd();
const relativePath = path.relative(scriptDir, invocationDir) ? path.relative(scriptDir, invocationDir) + '/' : '';

let debug = true;
if (debug){
    console.log({scriptDir, invocationDir, relativePath});
    console.log('INIT_CWD:', process.env.INIT_CWD);
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

// Parse YAML front matter from markdown content (no dependencies)
function parseFrontMatter(content) {
    const meta = { title: '', date: '', description: '' };
    if (!content.startsWith('---')) return meta;

    const endIndex = content.indexOf('---', 3);
    if (endIndex === -1) return meta;

    const yamlBlock = content.slice(3, endIndex).trim();
    for (const line of yamlBlock.split('\n')) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key in meta) meta[key] = value;
    }
    return meta;
}

// Parse HTML meta tags for front matter
function parseHtmlMeta(content) {
    const meta = { title: '', date: '', description: '' };

    // Extract title from <title> tag
    const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) meta.title = titleMatch[1].trim();

    // Extract meta tags: <meta name="date" content="...">
    const metaRegex = /<meta\s+name=["'](\w+)["']\s+content=["']([^"']*)["']/gi;
    let match;
    while ((match = metaRegex.exec(content)) !== null) {
        const key = match[1].toLowerCase();
        if (key in meta) meta[key] = match[2].trim();
    }
    return meta;
}

// Read file and extract metadata
function getPostMeta(fileName) {
    const filePath = path.join(invocationDir, fileName);
    const content = fs.readFileSync(filePath, 'utf-8');
    const isHtml = fileName.endsWith('.html');
    const meta = isHtml ? parseHtmlMeta(content) : parseFrontMatter(content);
    // Fallback to filename if no title
    if (!meta.title) meta.title = fileName.replace(/\.(md|html)$/, '');
    // Fallback to file mtime if no date
    if (!meta.date) {
        const stats = fs.statSync(filePath);
        meta.date = stats.mtime.toISOString().split('T')[0];
    }
    return meta;
}

function getSortedFileNames() {
    const fileNames = fs.readdirSync(invocationDir)
        .filter(name => (name.endsWith('.md') || name.endsWith('.html')) && name !== 'index.md' && name !== 'index.html');
    return fileNames;
}

const generateIndexFile = (fileNames) => {
    const posts = fileNames.map(fileName => ({ fileName, ...getPostMeta(fileName) }));
    // Sort by date descending (newest first)
    posts.sort((a, b) => b.date.localeCompare(a.date));

    const content = posts.map((post, index) =>
        `${index + 1}. [${post.title}](/${relativePath}${post.fileName})${post.description ? ' - ' + post.description : ''}`)
        .join('\n');

    fs.writeFileSync(`${invocationDir}/index.md`, conf.blogHeader + content);
    console.log(`created ${invocationDir}/index.md`);
};

const generateRssFile = (fileNames) => {
    const posts = fileNames.map(fileName => ({ fileName, ...getPostMeta(fileName) }));
    posts.sort((a, b) => b.date.localeCompare(a.date));

    const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>${conf.blogTitle}</title>
        <link>${conf.blogURL}</link>
        <description>${conf.blogDescription}</description>
        ${posts.map(post => `
        <item>
            <title>${post.title}</title>
            <link>${conf.blogURL}${post.fileName}</link>
            <description>${post.description || post.title}</description>
            <pubDate>${new Date(post.date).toUTCString()}</pubDate>
        </item>`).join('')}
    </channel>
</rss>`;
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
    if (commands.includes('all')) {
        const fileNames = getSortedFileNames();
        generateIndexFile(fileNames);
        generateRssFile(fileNames);
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
        console.log('Please provide at least one command: new, all, index, rss, edit');
    }
};

const args = process.argv.slice(2);
handleCommands(args);



