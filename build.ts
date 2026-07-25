#!/usr/bin/env node
/**
 * Build script: injects .env.local values into extension source files
 * Usage: node build.js
 */

import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = new URL(import.meta.url);
const __dirname = dirname(fileURLToPath(__filename));

function loadEnv() {
  const envPath = join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local not found. Copy .env.example to .env.local and fill in keys.');
    process.exit(1);
  }
  
  const env = {};
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...val] = line.split('=');
    if (key && val.length) {
      env[key.trim()] = val.join('=').trim();
    }
  });
  return env;
}

function injectKeys(content, env) {
  return content
    .replace(/__KILO_API_KEY__/g, env.KILO_API_KEY || '')
    .replace(/__GROQ_API_KEY__/g, env.GROQ_API_KEY || '')
    .replace(/__GEMINI_API_KEY__/g, env.GEMINI_API_KEY || '')
    .replace(/__GOOGLE_API_KEY__/g, env.GOOGLE_API_KEY || env.GEMINI_API_KEY || '');
}

function cleanModuleNoise(content) {
  return content.replace(/^export \{\};\s*$/gm, '');
}

function build() {
  const env = loadEnv();

  const distDir = join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const files = [
    'background.js',
    'content.js',
    'popup.js'
  ];

  let processed = 0;

  for (const file of files) {
    const filePath = join(distDir, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  ${file} not found in dist/, skipping`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    content = injectKeys(content, env);
    content = cleanModuleNoise(content);
    fs.writeFileSync(filePath, content);
    processed++;
  }

  console.log(`✅ Build complete - ${processed} files processed in dist/`);
  console.log('   API keys injected from .env.local');
}

build();
