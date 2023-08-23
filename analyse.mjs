#!/usr/bin/env node

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { exec } from 'child_process';

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
            const added = lines.filter(line => line.startsWith('+')).map(line => line.slice(1));
            const removed = lines.filter(line => line.startsWith('-')).map(line => line.slice(1));

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

exec('git diff', async (err, stdout, stderr) => {
    if (err) {
        console.error('Error running git diff:', err);
        return;
    }

    if (!stdout) {
        console.log('No changes detected by git diff.');
        return;
    }

    const fileDiffs = parseDiff(stdout);
    const allFeedback = [];

    for (const fileDiff of fileDiffs) {
        // Skip if not a PHP file
        if (!fileDiff.file_a.endsWith('.php') || !fileDiff.file_b.endsWith('.php')) {
            continue;
        }

        console.log(`Analyzing changes in: ${fileDiff.file_a} -> ${fileDiff.file_b}`);
        for (const hunk of fileDiff.hunks) {
            const hunkContent = `Added lines:\n${hunk.added.join('\n')}\n\nRemoved lines:\n${hunk.removed.join('\n')}`;
            const feedback = await getFeedbackFromGPT(hunkContent);
            console.log(`Feedback for hunk:\n`, feedback.content, "\n---\n");

            // Collect feedback in markdown format
            allFeedback.push(`## Feedback for ${fileDiff.file_a} -> ${fileDiff.file_b}:\n`, feedback.content, "\n---\n");
        }
    }

    // Write combined feedback to a markdown file
    const outputPath = path.join(process.cwd(), 'feedback.md');
    fs.writeFile(outputPath, allFeedback.join('\n'), (err) => {
        if (err) {
            console.error("Error writing to the file:", err);
        } else {
            console.log(`Feedback saved to ${outputPath}`);
        }
    });
});