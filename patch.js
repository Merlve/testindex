const fs = require('fs');
let code = fs.readFileSync('src/components/DetailsSkeleton.tsx', 'utf8');

code = code.replace("import { ChevronLeft } from 'lucide-react';", "import { ChevronLeft, RefreshCw } from 'lucide-react';");
code = code.replace("export default function DetailsSkeleton() {", "export default function DetailsSkeleton({ onRefresh, refreshingFolder }: { onRefresh?: () => void, refreshingFolder?: boolean }) {");
code = code.replace("<ChevronLeft size={24} />\n      </button>", "<ChevronLeft size={24} />\n      </button>\n      {onRefresh && (\n        <button onClick={onRefresh} disabled={refreshingFolder} className=\"absolute top-6 right-6 z-50 bg-black/50 border border-black/10 dark:border-white/10 text-black dark:text-white p-2 rounded-full hover:bg-black/10 dark:bg-white/10 transition backdrop-blur\" title=\"Refresh folder\">\n          <RefreshCw size={24} className={refreshingFolder ? 'animate-spin' : ''} />\n        </button>\n      )}");
fs.writeFileSync('src/components/DetailsSkeleton.tsx', code);
