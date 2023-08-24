#!/usr/bin/env node

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { minimatch } from 'minimatch';

dotenv.config();

const OPENAI_API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

function parseDiff(diffContent) {
    const rawFiles = diffContent.split("diff --git").slice(1);
    const fileDiffs = [];

    for (let fileDiff of rawFiles) {
        const fileNames = /a\/(.*?) b\/(.*)/.exec(fileDiff);
        if (!fileNames) continue;

        const hunks = fileDiff.split(/@@.*?@@/).slice(1);
        const parsedHunks = [];
        for (let hunk of hunks) {
            const lines = hunk.trim().split('\n');
            const added = [];
            const removed = [];

            let inBlockComment = false;
            let inHtmlComment = false;

            for (const line of lines) {
                if (line.startsWith('/*')) inBlockComment = true;
                if (line.startsWith('*/')) inBlockComment = false;
                if (line.startsWith('<!--')) inHtmlComment = true;
                if (line.startsWith('-->')) inHtmlComment = false;

                if (inBlockComment || inHtmlComment) continue;

                if (line.startsWith('+') && !line.startsWith('+//') && !line.startsWith('+#') && !line.startsWith('+<!--')) {
                    added.push(line.slice(1));
                }
                if (line.startsWith('-') && !line.startsWith('-//') && !line.startsWith('-#') && !line.startsWith('-<!--')) {
                    removed.push(line.slice(1));
                }
            }

            parsedHunks.push({
                added,
                removed
            });
        }

        fileDiffs.push({
            file_a: fileNames[1],
            file_b: fileNames[2],
            hunks: parsedHunks
        });
    }

    return fileDiffs;
}


async function getFeedbackFromGPT(diffContent) {
    try {
        const chatCompletion = await openai.chat.completions.create({
            messages: [{
                role: "user",
                content: `Review the following git diff, explain what the change will accomplish:\n\n${diffContent}`
            }],
            model: "gpt-3.5-turbo",
        });

        return chatCompletion.choices[0].message;
    } catch (error) {
        console.error('Error querying GPT:', error);
        return null;
    }
}

function isIgnoredFile(filePath, gitIgnorePatterns) {
    return gitIgnorePatterns.some(pattern => minimatch(filePath, pattern));
}

const targetBranch = process.argv[2] || 'master';

if (!targetBranch) {
    console.error('Please provide the target branch to compare to.');
    process.exit(1);
}

const command = `git diff ${targetBranch}`;
console.log(`Running command: ${command}`);
exec(command, async (err, stdout, stderr) => {
    console.log(stdout);
    console.log(stderr);
    if (err) {
        console.error('Error running git diff:', err);
        return;
    }

    if (!stdout) {
        console.log('No changes detected by git diff.');
        return;
    }

    const gitIgnorePath = path.join(process.cwd(), '.gitignore');
    const gitIgnorePatterns = fs.existsSync(gitIgnorePath) ? fs.readFileSync(gitIgnorePath, 'utf-8').split('\n') : [];

    const fileDiffs = parseDiff(stdout);
    const allFeedback = [];

    for (const fileDiff of fileDiffs) {
        const { file_a, file_b } = fileDiff;
        if (['composer.lock', 'package-lock.json', '.feature', '.lock', '.log', '.cache', '.md', '.env'].some(ext => file_a.endsWith(ext) || file_b.endsWith(ext)) ||
            isIgnoredFile(file_a, gitIgnorePatterns) ||
            isIgnoredFile(file_b, gitIgnorePatterns)) {
            continue;
        }

        console.log(`Analyzing changes in: ${file_a} -> ${file_b}`);
        for (const hunk of fileDiff.hunks) {
            const hunkContent = `Added lines:\n${hunk.added.join('\n')}\n\nRemoved lines:\n${hunk.removed.join('\n')}`;
            const feedback = await getFeedbackFromGPT(hunkContent);
            console.log(`Feedback for hunk:\n`, feedback.content, "\n---\n");

            // Collect feedback in markdown format
            allFeedback.push(`## Feedback for ${file_a} -> ${file_b}:\n`, feedback.content, "\n---\n");
        }
    }

    // Write combined feedback to a markdown file
    const outputPath = path.join(process.cwd(), 'feedback.md');
    fs.writeFile(outputPath, allFeedback.join('\n'), err => {
        if (err) {
            console.error("Error writing to the file:", err);
        } else {
            console.log(`Feedback saved to ${outputPath}`);
        }
    });
});
