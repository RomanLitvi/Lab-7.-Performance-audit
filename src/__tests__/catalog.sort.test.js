import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateTutors } from '../data/tutors';
import { DEFAULT_FILTERS } from '../App';
import { getVisibleTutors } from '../utils/catalog';
import { tutorScore } from '../utils/rating';

vi.mock('../utils/rating', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, tutorScore: vi.fn(actual.tutorScore) };
});

describe('сортування «Рекомендовані»', () => {
  const tutors = generateTutors(500);

  beforeEach(() => {
    tutorScore.mockClear();
  });

  it('рахує рейтинг кожного репетитора не більше одного разу', () => {
    getVisibleTutors(tutors, { query: '', filters: DEFAULT_FILTERS, sortBy: 'recommended' });

    expect(tutorScore.mock.calls.length).toBeLessThanOrEqual(tutors.length);
  });

  it('зберігає порядок від найвищого рейтингу до найнижчого', async () => {
    const { tutorScore: score } = await vi.importActual('../utils/rating');
    const visible = getVisibleTutors(tutors, {
      query: '',
      filters: DEFAULT_FILTERS,
      sortBy: 'recommended',
    });
    const expected = [...tutors].sort((a, b) => score(b) - score(a)).map((t) => t.id);

    expect(visible.map((t) => t.id)).toEqual(expected);
  });
});
