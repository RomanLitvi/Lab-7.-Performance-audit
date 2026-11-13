import { matchesQuery } from './text';
import { tutorScore } from './rating';

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Рекомендовані' },
  { value: 'price-asc', label: 'Спочатку дешевші' },
  { value: 'price-desc', label: 'Спочатку дорожчі' },
  { value: 'experience', label: 'За досвідом' },
  { value: 'name', label: 'За іменем' },
];

const comparators = {
  'price-asc': (a, b) => a.pricePerHour - b.pricePerHour,
  'price-desc': (a, b) => b.pricePerHour - a.pricePerHour,
  experience: (a, b) => b.experienceYears - a.experienceYears,
  name: (a, b) => a.lastName.localeCompare(b.lastName, 'uk'),
};

export function applyFilters(list, filters) {
  return list.filter((tutor) => {
    if (filters.subjects.length && !filters.subjects.some((s) => tutor.subjects.includes(s))) {
      return false;
    }
    if (filters.city && tutor.city !== filters.city) return false;
    if (filters.format !== 'all' && tutor.format !== filters.format && tutor.format !== 'both') {
      return false;
    }
    if (tutor.pricePerHour > filters.maxPrice) return false;
    if (filters.verifiedOnly && !tutor.verified) return false;
    return true;
  });
}

function sortByScore(list) {
  const scores = new Map(list.map((tutor) => [tutor.id, tutorScore(tutor)]));
  return list.sort((a, b) => scores.get(b.id) - scores.get(a.id));
}

export function getVisibleTutors(list, { query, filters, sortBy }) {
  const result = applyFilters(list, filters).filter((tutor) => matchesQuery(tutor, query));
  const compare = comparators[sortBy];
  return compare ? result.sort(compare) : sortByScore(result);
}
