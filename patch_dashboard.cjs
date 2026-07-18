const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

const featuredSlideReplacement = `<FeaturedSlide 
         featured={featured} 
         slideIndex={slideIndex} 
         totalSlides={featuredItems.length} 
         onNext={() => setSlideIndex(prev => (prev + 1) % featuredItems.length)}
         onPrev={() => setSlideIndex(prev => (prev - 1 + featuredItems.length) % featuredItems.length)}
         onSetSlide={(idx) => setSlideIndex(idx)}
       />`;

code = code.replace(/<FeaturedSlide\s+featured=\{featured\}\s+slideIndex=\{slideIndex\}\s+totalSlides=\{featuredItems\.length\}\s+\/>/, featuredSlideReplacement);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
