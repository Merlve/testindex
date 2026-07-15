import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function test() {
  const url = process.env.JELLYFIN_URL?.replace(/^["']|["']$/g, '');
  const apiKey = process.env.JELLYFIN_API_KEY?.replace(/^["']|["']$/g, '');
  const userId = process.env.JELLYFIN_USER_ID?.replace(/^["']|["']$/g, '');
  
  console.log("URL:", url);
  console.log("API Key length:", apiKey?.length);
  console.log("User ID:", userId);

  try {
    const fetchUrl = `${url?.replace(/\/$/, '')}/Users/${userId}/Items/Latest`;
    console.log(`Testing Latest Items... ${fetchUrl}`);
    const res = await axios.get(fetchUrl, {
      headers: { 'X-Emby-Token': apiKey }
    });
    console.log(`Latest Items: SUCCESS`, res.data?.length);
  } catch (e: any) {
    console.log(`Latest Items: FAILED - ${e.response?.status} ${e.response?.statusText}`);
    console.log(`Error data:`, e.response?.data);
  }
}
test();
