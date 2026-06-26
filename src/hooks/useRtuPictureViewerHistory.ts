import { useEffect } from 'react'
import { useUiStore } from '@/stores/uiStore'

/** Close the RTU picture viewer when the user presses the browser back button. */
export function useRtuPictureViewerHistory(): void {
  useEffect(() => {
    const onPopState = () => {
      const { rtuPictureViewer, closeRtuPictureViewer } = useUiStore.getState()
      if (rtuPictureViewer) {
        closeRtuPictureViewer(true)
      }
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])
}
