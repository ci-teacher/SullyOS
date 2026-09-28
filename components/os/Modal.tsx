import React from 'react';
import { X } from '@phosphor-icons/react';

interface ModalProps {
    isOpen: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
}

const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, footer }) => {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-5"
            style={{
                paddingTop: 'calc(var(--safe-top, 0px) + 1rem)',
                paddingBottom: 'calc(var(--safe-bottom, 0px) + 1rem)',
                maxHeight: 'var(--visual-viewport-height, 100dvh)',
            }}
        >
            <button
                aria-label="关闭"
                className="absolute inset-0 h-full w-full bg-black/30 backdrop-blur-[2px]"
                onClick={onClose}
            />
            <div className="relative flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-black/[0.08] bg-[#fffdfa] text-[#221d1a] shadow-[0_24px_80px_rgba(29,18,13,0.20)]">
                <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-5">
                    <h3 className="pt-1 text-base font-semibold tracking-[-0.01em]">{title}</h3>
                    <button
                        onClick={onClose}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/[0.05] text-black/50 transition active:scale-95"
                    >
                        <X size={15} />
                    </button>
                </div>
                <div className="min-h-0 max-h-[62vh] overflow-y-auto overscroll-contain px-5 py-4">
                    {children}
                </div>
                {footer && (
                    <div className="shrink-0 border-t border-black/[0.06] px-5 py-4">
                        <div className="flex gap-3">{footer}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Modal;
