import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  
  try {
    const fetchUrl = `${url?.replace(/\/$/, '')}/Users`;
    const res = await axios.get(fetchUrl, {
      headers: { 'X-Emby-Token': apiKey }
    });
    console.log(`Users count:`, res.data.length);
    console.log(`First 5 users:`, res.data.slice(0,5).map((u:any) => ({ Name: u.Name, Id: u.Id })));
  } catch (e: any) {
    console.log(`FAILED - ${e.response?.status} ${e.response?.statusText}`);
  }
}
test();
