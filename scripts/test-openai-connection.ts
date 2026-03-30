/**
 * Test OpenAI API Connection
 * Run: npx tsx scripts/test-openai-connection.ts
 */

import dotenv from 'dotenv';
import { resolve } from 'path';
import OpenAI from 'openai';

// Load .env.local explicitly
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

async function testConnection() {
  console.log('🔍 Testing OpenAI API Connection...\n');

  // Check API key
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in .env.local');
    process.exit(1);
  }

  console.log('✅ API Key found:', apiKey.substring(0, 20) + '...');

  // Test connection
  try {
    const client = new OpenAI({ apiKey });

    console.log('\n🧪 Testing API connection...');
    
    // Simple test: list models
    const models = await client.models.list();
    
    console.log('✅ Connection successful!');
    console.log('📊 Available models:', models.data.length);
    
    // Check if Whisper is available
    const whisperModel = models.data.find(m => m.id === 'whisper-1');
    if (whisperModel) {
      console.log('✅ Whisper model available');
    } else {
      console.log('⚠️  Whisper model not found in list');
    }

    // Check if GPT-4 is available
    const gpt4Model = models.data.find(m => m.id.includes('gpt-4'));
    if (gpt4Model) {
      console.log('✅ GPT-4 models available');
    } else {
      console.log('⚠️  GPT-4 models not found - you may need to upgrade your account');
    }

    console.log('\n✅ All tests passed! OpenAI API is working correctly.');
    
  } catch (error: any) {
    console.error('\n❌ Connection failed!');
    console.error('Error:', error.message);
    
    if (error.status === 401) {
      console.error('\n🔑 API Key is invalid or expired');
      console.error('👉 Get a new key from: https://platform.openai.com/api-keys');
    } else if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
      console.error('\n🌐 Network connection issue');
      console.error('👉 Check your internet connection');
      console.error('👉 Try using a VPN if you\'re in a restricted region');
    } else {
      console.error('\nFull error:', error);
    }
    
    process.exit(1);
  }
}

testConnection();
