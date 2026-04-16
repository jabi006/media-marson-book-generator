import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('renders the provided label', () => {
    render(<StatusBadge label="outline ready" tone="success" />);

    expect(screen.getByText('outline ready')).toBeInTheDocument();
  });
});
