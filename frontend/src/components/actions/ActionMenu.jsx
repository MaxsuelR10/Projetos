import { useEffect, useRef, useState } from "react";

export function ActionMenu({ label = "Ações da conta", items }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const primaryItems = items.slice(0, 2);
  const secondaryItems = items.slice(2);

  useEffect(() => {
    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div className="action-menu" ref={menuRef}>
      <div className="account-primary-actions">
        {primaryItems.map((item) => (
          <button key={item.label} type="button" disabled={item.disabled} onClick={item.onSelect}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="action-menu-dropdown">
        <button
          type="button"
          className="secondary-button action-menu-trigger"
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((current) => !current)}
        >
          Mais ações <span aria-hidden="true">⋮</span>
        </button>
        {open ? (
          <div className="action-menu-panel" role="menu" aria-label={label}>
          {secondaryItems.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={item.destructive ? "danger-action" : ""}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
