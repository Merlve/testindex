import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  
  try {
      console.log(`Testing System Info with Authorization Header...`);
      const res = await axios.get(`${url?.replace(/\/$/, '')}/System/Info`, {
        headers: { 'Authorization': `MediaBrowser Token="${apiKey}"` }
      });
      console.log(`System Info: SUCCESS`);
  } catch (e: any) {
      console.log(`System Info: FAILED - ${e.response?.status} ${e.response?.statusText}`);
  }
}
test();
