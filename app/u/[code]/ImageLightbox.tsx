'use client'

import { useCallback, useEffect, useRef } from 'react'

export interface LightboxImage {
  id: string
  url: string
}

interface ImageLightboxProps {
  images: LightboxImage[]
  currentIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export default function ImageLightbox({
  images,
  currentIndex,
  onClose,
  onPrev,
  onNext,
}: ImageLightboxProps) {
  const touchStartX = useRef(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    },
    [onClose, onPrev, onNext]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      if (diff > 0) onNext()
      else onPrev()
    }
  }

  if (!images[currentIndex]) return null

  const current = images[currentIndex]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 z-10 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white text-2xl rounded-full hover:bg-white/10 transition-colors"
        onClick={onClose}
        aria-label="关闭"
      >
        ✕
      </button>

      {currentIndex > 0 && (
        <button
          type="button"
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center text-white/70 hover:text-white text-3xl rounded-full hover:bg-white/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onPrev()
          }}
          aria-label="上一张"
        >
          ‹
        </button>
      )}

      <div
        role="none"
        className="flex items-center justify-center w-full h-full p-4 sm:p-8"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <img
          src={current.url}
          alt=""
          className="max-w-full max-h-[85vh] object-contain rounded-lg select-none"
          draggable={false}
        />
      </div>

      {currentIndex < images.length - 1 && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-12 h-12 flex items-center justify-center text-white/70 hover:text-white text-3xl rounded-full hover:bg-white/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            onNext()
          }}
          aria-label="下一张"
        >
          ›
        </button>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/50 text-sm font-medium">
        {currentIndex + 1} / {images.length}
      </div>
    </div>
  )
}