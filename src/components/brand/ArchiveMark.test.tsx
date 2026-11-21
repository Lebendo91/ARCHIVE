import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import markSvg from '../../../assets/brand/archive-mark.svg?raw';
import { ArchiveMark, MARK_APEX, MARK_STRATA } from './ArchiveMark';

describe('ArchiveMark', () => {
  it('uses exactly the geometry of the brand asset', () => {
    const points = [...markSvg.matchAll(/points="([^"]+)"/g)].map((match) => match[1]);
    expect(points).toEqual([MARK_APEX, ...MARK_STRATA]);
  });

  it('is decorative without a title and an image with one', () => {
    const { container, rerender } = render(<ArchiveMark />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    rerender(<ArchiveMark title="ARCHIVE" />);
    expect(container.querySelector('svg')).toHaveAttribute('role', 'img');
    expect(container.querySelector('svg')).toHaveAccessibleName('ARCHIVE');
  });
});
