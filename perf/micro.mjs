// Node micro-benchmarks for functions that look expensive. Median of 7 runs, ms.
import { performance } from 'node:perf_hooks';
import { generateTutors, tutors } from '../src/data/tutors.js';
import { getVisibleTutors, applyFilters } from '../src/utils/catalog.js';
import { tutorScore, weightedRating } from '../src/utils/rating.js';
import { matchesQuery } from '../src/utils/text.js';
import { suggestNames } from '../src/utils/suggest.js';
import { buildSubjectOptions } from '../src/utils/subjectOptions.js';
import { formatPrice } from '../src/utils/format.js';
import { SUBJECTS } from '../src/data/subjects.js';
import { fetchCities, fetchRegions, fetchPriceBounds } from '../src/api/reference.js';

const DEFAULT_FILTERS = { subjects: [], city: '', format: 'all', maxPrice: 1200, verifiedOnly: false };
const bench = async (name, fn) => {
  const times = [];
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(name.padEnd(48), times[3].toFixed(3), 'ms');
};

let calls = 0;
await bench('generateTutors(2000)', () => generateTutors());
await bench('getVisibleTutors recommended (full sort)', () => getVisibleTutors(tutors, { query: '', filters: DEFAULT_FILTERS, sortBy: 'recommended' }));
await bench('getVisibleTutors price-asc', () => getVisibleTutors(tutors, { query: '', filters: DEFAULT_FILTERS, sortBy: 'price-asc' }));
await bench('tutorScore x 2000 (once per tutor)', () => tutors.forEach(tutorScore));
await bench('applyFilters only', () => applyFilters(tutors, DEFAULT_FILTERS));
await bench('matchesQuery "математика" x 2000', () => tutors.filter((t) => matchesQuery(t, 'математика')));
await bench('suggestNames("матиматика")', () => suggestNames('матиматика', tutors));
await bench('buildSubjectOptions + counts', () => {
  const counts = tutors.reduce((acc, t) => { t.subjects.forEach((s) => { acc[s] = (acc[s] || 0) + 1; }); return acc; }, {});
  buildSubjectOptions(SUBJECTS, counts);
});
await bench('formatPrice x 2000', () => tutors.forEach((t) => formatPrice(t.pricePerHour)));
await bench('reference fetch chain', async () => { const c = await fetchCities(); await fetchRegions(c); await fetchPriceBounds(); });
const orig = weightedRating;
let n = 0;
const cmp = (a, b) => { n += 2; return tutorScore(b) - tutorScore(a); };
[...tutors].sort(cmp);
console.log('tutorScore calls during one recommended sort:', n);
