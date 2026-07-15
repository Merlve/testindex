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
    
    const admins = res.data.filter((u:any) => u.Policy?.IsAdministrator);
    console.log(`Admins:`, admins.map((u:any) => ({ Name: u.Name, Id: u.Id })));
  } catch (e: any) {
    console.log(`FAILED - ${e.response?.status} ${e.response?.statusText}`);
  }
}
test();
