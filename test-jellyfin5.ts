import fs from 'fs';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  
  try {
      console.log(`Testing System Info Public...`);
      const res = await axios.get(`${url?.replace(/\/$/, '')}/System/Info/Public`);
      console.log(`System Info Public: SUCCESS`, res.data);
  } catch (e: any) {
      console.log(`System Info Public: FAILED - ${e.response?.status} ${e.response?.statusText}`);
  }
}
test();
