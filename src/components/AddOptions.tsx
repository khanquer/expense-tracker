import { useRef } from 'react'
import { Icon, type IconName } from './Icon'

/**
 * The ways to add an expense, as a list. Owns the file inputs so the camera and picker
 * open straight from the tap (browsers block pickers opened later).
 */
export function AddOptions({ onFiles, onMode }: { onFiles: (files: Blob[]) => void; onMode: (mode: 'note' | 'manual') => void }) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length) onFiles(files)
  }

  const options: { icon: IconName; title: string; hint: string; onClick: () => void }[] = [
    { icon: 'camera', title: 'Scan a receipt', hint: 'Take a photo of a bill', onClick: () => cameraRef.current?.click() },
    { icon: 'image', title: 'Screenshot or photo', hint: 'Swiggy, Zomato, Instamart…', onClick: () => galleryRef.current?.click() },
    { icon: 'note', title: 'Quick note', hint: '“auto to office 120”', onClick: () => onMode('note') },
    { icon: 'pencil', title: 'Enter manually', hint: 'Fill in the details yourself', onClick: () => onMode('manual') },
  ]

  return (
    <>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
      <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={onPick} />
      {options.map((o) => (
        <button key={o.title} className="row-item pressable" onClick={o.onClick}>
          <span className="badge badge-accent">
            <Icon name={o.icon} size={22} />
          </span>
          <span className="grow row-text">
            <span className="row-title">{o.title}</span>
            <span className="row-sub">{o.hint}</span>
          </span>
          <Icon name="chevronRight" size={20} className="chev" />
        </button>
      ))}
    </>
  )
}
