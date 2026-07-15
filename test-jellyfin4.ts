import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  
  try {
      console.log(`Testing System Info with full Authorization Header...`);
      const auth = `MediaBrowser Client="other", Device="other", DeviceId="1234", Version="1.0.0", Token="${apiKey}"`;
      const res = await axios.get(`${url?.replace(/\/$/, '')}/System/Info`, {
        headers: { 'Authorization': auth }
      });
      console.log(`System Info: SUCCESS`);
  } catch (e: any) {
      console.log(`System Info: FAILED - ${e.response?.status} ${e.response?.statusText}`);
  }
}
test();
