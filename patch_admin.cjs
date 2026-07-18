const fs = require('fs');
let code = fs.readFileSync('src/pages/Admin.tsx', 'utf8');

code = code.replace(
  "const [config, setConfig] = useState({ openlistUrl: '', basePath: '' });",
  "const [config, setConfig] = useState({ openlistUrl: '', basePath: '', inactivityTimeout: 0 });"
);

const configInput = `          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Base Path</label>
            <input 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.basePath}
              onChange={e => setConfig({ ...config, basePath: e.target.value })}
            />
          </div>`;

const configInputNew = `          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Base Path</label>
            <input 
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.basePath}
              onChange={e => setConfig({ ...config, basePath: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-gray-600 dark:text-gray-400 mb-2 text-xs font-bold uppercase tracking-wider">Inactivity Logout Timer (Minutes, 0 to disable)</label>
            <input 
              type="number"
              min="0"
              className="w-full bg-[#fffcf9] dark:bg-[#08080a] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-black dark:text-white focus:outline-none focus:border-purple-600/50 transition-colors"
              value={config.inactivityTimeout}
              onChange={e => setConfig({ ...config, inactivityTimeout: parseInt(e.target.value) || 0 })}
            />
          </div>`;

code = code.replace(configInput, configInputNew);
fs.writeFileSync('src/pages/Admin.tsx', code);
