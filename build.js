#!/usr/bin/env node
/**
 * Build script: injects .env.local values into extension source files
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = path.join(__dirname, '.env.local');
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
    .replace(/__GEMINI_API_KEY__/g, env.GEMINI_API_KEY || '');
}

function build() {
  const env = loadEnv();
  
  // Files to process
  const files = [
    'background.js',
    'popup.js'
  ];
  
  let processed = 0;
  
  for (const file of files) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  ${file} not found, skipping`);
      continue;
    }
    
    let content = fs.readFileSync(filePath, 'utf8');
    content = injectKeys(content, env);
    fs.writeFileSync(filePath, content);
    processed++;
  }
  
  console.log(`✅ Build complete - ${processed} files processed`);
  console.log('   API keys injected from .env.local');
}

build();
