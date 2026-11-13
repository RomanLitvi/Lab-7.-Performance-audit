import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../App';
import { averageRating } from '../utils/rating';

vi.mock('../data/tutors', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, tutors: actual.generateTutors(200) };
});

// TutorCard calls averageRating once per render, so its call count is the number of card renders.
vi.mock('../utils/rating', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, averageRating: vi.fn(actual.averageRating) };
});

describe('список репетиторів', () => {
  it('після додавання в обрані перерендерює лише змінену картку', () => {
    render(<App />);
    const [first] = screen.getAllByRole('button', { name: 'Додати в обрані' });
    averageRating.mockClear();

    fireEvent.click(first);

    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(averageRating.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
