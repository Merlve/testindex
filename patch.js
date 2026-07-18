const fs = require('fs');
let code = fs.readFileSync('src/components/MovieCollectionsCarousel.tsx', 'utf8');

code = code.replace("import { Library } from 'lucide-react';", "import { Library, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';\nimport { Link } from 'react-router';\nimport { useAuth } from '../context/AuthContext';");
code = code.replace("export default function MovieCollectionsCarousel({ categories }: { categories: any[] }) {", "export default function MovieCollectionsCarousel({ categories }: { categories: any[] }) {\n  const { user } = useAuth();");

const headerSearch = `<div className="flex justify-between items-end mb-4">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
           <Library className="text-blue-500" size={20} />
           Movie Collections
        </h3>
      </div>`;

const headerReplacement = `<div className="flex justify-between items-end mb-4">
        <h3 className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
           <Library className="text-blue-500" size={20} />
           Movie Collections
        </h3>
        
        <div className="flex gap-2 items-center">
          {user === 'admin' && (
            <button 
              onClick={fetchCollections}
              disabled={loading}
              className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:bg-white/20 text-black dark:text-white rounded-lg transition disabled:opacity-50 mr-2"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {loading ? "Scanning..." : "Scan Collections"}
            </button>
          )}
          <Link to="/collections" className="text-xs text-purple-400 hover:text-purple-300 font-bold uppercase tracking-wider mr-2 hidden sm:block">View All</Link>
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: -400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white hidden sm:flex">
            <ChevronLeft size={16} />
          </div>
          <div onClick={(e) => (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement)?.scrollBy({ left: 400, behavior: 'smooth' })} className="w-8 h-8 rounded-full border border-black/10 dark:border-white/10 flex items-center justify-center hover:bg-black/5 dark:bg-white/5 cursor-pointer text-black dark:text-white hidden sm:flex">
            <ChevronRight size={16} />
          </div>
        </div>
      </div>`;

code = code.replace(headerSearch, headerReplacement);

code = code.replace("const fetchCollections = async () => {", "const fetchCollections = async () => {");
// wait fetchCollections is inside useEffect. We need to pull it out.
code = code.replace(/useEffect\(\(\) => \{\n    const fetchCollections = async \(\) => \{/, "const fetchCollections = async () => {");
code = code.replace(/    if \(categories\.length > 0\) \{\n      fetchCollections\(\);\n    \}\n  \}, \[categories\]\);/, "useEffect(() => {\n    if (categories.length > 0) {\n      fetchCollections();\n    }\n  }, [categories]);");

fs.writeFileSync('src/components/MovieCollectionsCarousel.tsx', code);
