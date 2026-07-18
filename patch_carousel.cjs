const fs = require('fs');
let code = fs.readFileSync('src/components/MovieCollectionsCarousel.tsx', 'utf8');

const scanLogic = `
  const [isScanning, setIsScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');

  const handleScan = async () => {
    try {
      setIsScanning(true);
      await axios.post('/api/tmdb/scan_collections/start');
      pollScanStatus();
    } catch(e) {
      console.error(e);
      setIsScanning(false);
    }
  };

  const pollScanStatus = async () => {
    try {
      const res = await axios.get('/api/tmdb/scan_collections/status');
      if (res.data.isRunning) {
        setScanMessage(res.data.message);
        setTimeout(pollScanStatus, 1000);
      } else {
        setIsScanning(false);
        setScanMessage('');
        fetchCollections(); // refresh the list
      }
    } catch(e) {
      setIsScanning(false);
    }
  };
  
  // Also poll on mount in case it's already running
  useEffect(() => {
    axios.get('/api/tmdb/scan_collections/status').then(res => {
       if (res.data.isRunning) {
           setIsScanning(true);
           pollScanStatus();
       }
    });
  }, []);
`;

code = code.replace("const [loading, setLoading] = useState(true);", "const [loading, setLoading] = useState(true);\n" + scanLogic);

code = code.replace("onClick={() => fetchCollections()}", "onClick={handleScan}");
code = code.replace("disabled={loading}", "disabled={loading || isScanning}");
code = code.replace("className={loading ? 'animate-spin' : ''}", "className={isScanning ? 'animate-spin' : ''}");
code = code.replace("{loading ? 'Scanning...' : 'Scan'}", "{isScanning ? (scanMessage || 'Scanning...') : 'Scan'}");

fs.writeFileSync('src/components/MovieCollectionsCarousel.tsx', code);
