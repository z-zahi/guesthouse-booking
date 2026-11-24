import { useState } from 'react';
import { AlertDialog } from '@base-ui/react/alert-dialog';
import { photoUrl } from './api.js';

const PATHS = {
  house: 'M3 10.5 12 3l9 7.5M5.5 8.5V20h13V8.5M10 20v-5.5h4V20',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Zm4.7-1.8L20 20',
  calendar: 'M4 6.5h16V20H4zM4 10h16M8.5 3.5v4M15.5 3.5v4',
  bed: 'M3 18.5V7M3 14h18v4.5M21 14v-2.5a3 3 0 0 0-3-3h-7V14M7 11.5a1.5 1.5 0 1 0 0-.01',
  list: 'M8.5 6.5H20M8.5 12H20M8.5 17.5H20M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01',
  chart: 'M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-4',
  photo: 'M4 6h16v12H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  people:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 4.5a3.3 3.3 0 0 1 0 6.3M18 14.8c1.7.7 2.8 2.4 3 5.2',
};

export function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function PageHead({ eyebrow, title, lead, children }) {
  return (
    <header className="page-head">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}

export function Empty({ icon = 'list', title, children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={26} />
      </span>
      <p className="empty-title">{title}</p>
      {children && <div className="empty-text">{children}</div>}
    </div>
  );
}

export function RoomImage({ room, url = room.photo_urls?.[0], className = '', priority = false }) {
  if (url)
    return (
      <img
        className={`room-image ${className}`}
        src={photoUrl(url)}
        alt={room.name}
        width="1200"
        height="800"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
      />
    );
  return (
    <div className={`room-image placeholder ${className}`} aria-hidden="true">
      <Icon name="bed" size={30} />
    </div>
  );
}

export function ConfirmButton({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  className = 'danger',
  disabled,
  children,
}) {
  const [open, setOpen] = useState(false);
  return (
    <AlertDialog.Root open={open} onOpenChange={setOpen}>
      <AlertDialog.Trigger className={className} disabled={disabled} aria-label={children === '×' ? title : undefined}>
        {children}
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="dialog-backdrop" />
        <AlertDialog.Popup className="dialog">
          <AlertDialog.Title className="dialog-title">{title}</AlertDialog.Title>
          {description && <AlertDialog.Description className="dialog-text">{description}</AlertDialog.Description>}
          <div className="dialog-actions">
            <AlertDialog.Close className="secondary">{cancelLabel}</AlertDialog.Close>
            <button
              className="destructive"
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
