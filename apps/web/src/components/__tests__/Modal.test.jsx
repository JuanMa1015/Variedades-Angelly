import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Modal from '../Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<Modal isOpen={false} onClose={vi.fn()} title="Test" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders title and content when open', () => {
    render(<Modal isOpen onClose={vi.fn()} title="Test Title"><p>Content</p></Modal>);
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: /cerrar modal/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Test" />);
    fireEvent.click(screen.getByRole('button', { name: /cerrar modal/i }).closest('.fixed'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when inner content is clicked', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Test"><span>Inner</span></Modal>);
    fireEvent.click(screen.getByText('Inner'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders subtitle when provided', () => {
    render(<Modal isOpen onClose={vi.fn()} title="Title" subtitle="Subtitle text" />);
    expect(screen.getByText('Subtitle text')).toBeInTheDocument();
  });

  it('renders admin variant classes', () => {
    const { container } = render(<Modal isOpen onClose={vi.fn()} title="Admin" variant="admin" />);
    const containerDiv = container.querySelector('.rounded-\\[28px\\]');
    expect(containerDiv).toBeTruthy();
  });

  it('accepts custom maxWidth', () => {
    const { container } = render(<Modal isOpen onClose={vi.fn()} title="Wide" maxWidth="max-w-4xl" />);
    const inner = container.querySelector('.max-w-4xl');
    expect(inner).toBeTruthy();
  });
});
