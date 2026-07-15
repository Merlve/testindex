import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  const userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');
  
  const endpoints = [
    `/Users`,
    `/Users/${userId}`,
    `/Items?Limit=1`,
  ];
  
  for (const endpoint of endpoints) {
    try {
      const fetchUrl = `${url?.replace(/\/$/, '')}${endpoint}`;
      console.log(`Testing ${fetchUrl}`);
      const res = await axios.get(fetchUrl, {
        headers: { 'X-Emby-Token': apiKey }
      });
      console.log(`SUCCESS:`, Array.isArray(res.data) ? res.data?.length : Object.keys(res.data).length);
    } catch (e: any) {
      console.log(`FAILED - ${e.response?.status} ${e.response?.statusText}`);
    }
  }
}
test();
