import { useEffect, useRef, useState } from "react";

export function ActionMenu({ label = "Ações", items, showPrimary = true }) {
  const [open, setOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const menuRef = useRef(null);
  const primaryItems = showPrimary ? items.slice(0, 2) : [];
  const secondaryItems = showPrimary ? items.slice(2) : items;

  function toggleMenu(event) {
    if (open) {
      setOpen(false);
      return;
    }
    const triggerBounds = event.currentTarget.getBoundingClientRect();
    const estimatedMenuHeight = secondaryItems.length * 44 + 18;
    const spaceBelow = window.innerHeight - triggerBounds.bottom;
    setOpensUpward(spaceBelow < estimatedMenuHeight && triggerBounds.top > spaceBelow);
    setOpen(true);
  }

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
          className={`secondary-button action-menu-trigger ${showPrimary ? "" : "icon-button"}`}
          aria-label={label}
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={toggleMenu}
        >
          {showPrimary ? <>Mais ações <span aria-hidden="true">⋮</span></> : <span aria-hidden="true">⋮</span>}
        </button>
        {open ? (
          <div className={`action-menu-panel ${opensUpward ? "opens-upward" : ""}`} role="menu" aria-label={label}>
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
